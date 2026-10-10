import { isUniqueViolation, queryOne, type Db } from '../db/index.js';
import type { AccountSummary, SessionUser, UserRecord } from '../types/user.js';

const USER_COLUMNS = `
  id,
  username,
  display_name AS "displayName",
  role,
  pin_hash AS "pinHash",
  token_version AS "tokenVersion",
  failed_attempts AS "failedAttempts",
  locked_until AS "lockedUntil",
  disabled_at AS "disabledAt",
  last_login_at AS "lastLoginAt",
  last_seen_at AS "lastSeenAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"`;

/** Wrong PINs in a row before the account is locked, and for how long. */
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;

// Every request looks its account up (a disabled account or reset PIN must end sessions at once),
// so recent lookups are kept briefly. Any change to an account drops its entry.
const CACHE_MS = 15_000;
// last_seen_at is a rough "last active", written at most this often per account.
const SEEN_EVERY_MS = 5 * 60 * 1000;

export class UsernameTakenError extends Error {}

export const toSessionUser = ({ id, username, displayName, role }: UserRecord): SessionUser => ({ id, username, displayName, role });

export class UserService {
  private readonly cache = new Map<string, { user: UserRecord | null; at: number }>();
  private readonly lastSeen = new Map<string, number>();

  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<UserRecord | null> {
    return queryOne<UserRecord>(this.db, `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    return queryOne<UserRecord>(this.db, `SELECT ${USER_COLUMNS} FROM users WHERE username = $1`, [username.trim().toLowerCase()]);
  }

  async getAdmin(): Promise<UserRecord> {
    const admin = await queryOne<UserRecord>(this.db, `SELECT ${USER_COLUMNS} FROM users WHERE role = 'admin'`);
    if (!admin) throw new Error('The admin account is missing; run the database migrations');
    return admin;
  }

  /** The account a token belongs to, briefly cached. Tokens from before accounts say 'owner'. */
  async findForSession(subject: string): Promise<UserRecord | null> {
    const cached = this.cache.get(subject);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.user;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subject);
    const user = subject === 'owner' ? await this.getAdmin() : isUuid ? await this.findById(subject) : null;
    if (this.cache.size > 1000) this.cache.clear();
    this.cache.set(subject, { user, at: Date.now() });
    return user;
  }

  /** Notes that the account is active; cheap to call on every request. */
  touch(id: string): void {
    const now = Date.now();
    if (now - (this.lastSeen.get(id) ?? 0) < SEEN_EVERY_MS) return;
    this.lastSeen.set(id, now);
    void this.db.query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [id]).catch(() => undefined);
  }

  async createListener(input: { username: string; displayName: string | null; pinHash: string }): Promise<UserRecord> {
    try {
      const user = await queryOne<UserRecord>(
        this.db,
        `INSERT INTO users (username, display_name, role, pin_hash) VALUES ($1, $2, 'listener', $3) RETURNING ${USER_COLUMNS}`,
        [input.username, input.displayName, input.pinHash],
      );
      return user!;
    } catch (error) {
      if (isUniqueViolation(error)) throw new UsernameTakenError(input.username);
      throw error;
    }
  }

  async update(id: string, patch: { displayName?: string | null; disabled?: boolean }): Promise<UserRecord | null> {
    const user = await queryOne<UserRecord>(
      this.db,
      `UPDATE users SET
         display_name = CASE WHEN $2 THEN $3 ELSE display_name END,
         disabled_at = CASE WHEN $4::boolean IS NULL THEN disabled_at WHEN $4 THEN COALESCE(disabled_at, NOW()) ELSE NULL END,
         -- Disabling ends every session at once.
         token_version = token_version + CASE WHEN $4 AND disabled_at IS NULL THEN 1 ELSE 0 END
       WHERE id = $1
       RETURNING ${USER_COLUMNS}`,
      [id, patch.displayName !== undefined, patch.displayName ?? null, patch.disabled ?? null],
    );
    this.forget(id);
    return user;
  }

  /** Sets a new PIN, clears any lockout, and signs the account out everywhere. */
  async setPin(id: string, pinHash: string, options: { endSessions: boolean }): Promise<UserRecord | null> {
    const user = await queryOne<UserRecord>(
      this.db,
      `UPDATE users SET pin_hash = $2, failed_attempts = 0, locked_until = NULL,
         token_version = token_version + CASE WHEN $3 THEN 1 ELSE 0 END
       WHERE id = $1 AND role = 'listener'
       RETURNING ${USER_COLUMNS}`,
      [id, pinHash, options.endSessions],
    );
    this.forget(id);
    return user;
  }

  async delete(id: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(this.db, "DELETE FROM users WHERE id = $1 AND role = 'listener' RETURNING id", [id]);
    this.forget(id);
    return row !== null;
  }

  /** Counts a wrong PIN; the MAX_PIN_ATTEMPTS-th in a row locks the account for PIN_LOCK_MS. */
  async recordFailedPin(id: string): Promise<{ locked: boolean }> {
    const row = await queryOne<{ locked: boolean }>(
      this.db,
      `UPDATE users SET
         failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END,
         locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN NOW() + make_interval(secs => $3) ELSE locked_until END
       WHERE id = $1
       RETURNING locked_until IS NOT NULL AND locked_until > NOW() AS locked`,
      [id, MAX_PIN_ATTEMPTS, PIN_LOCK_MS / 1000],
    );
    this.forget(id);
    return { locked: row?.locked ?? false };
  }

  async recordLogin(id: string): Promise<void> {
    await this.db.query('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW(), last_seen_at = NOW() WHERE id = $1', [id]);
    this.forget(id);
  }

  /** Every account with the numbers the admin panel shows. Admin first, then by name. */
  async listSummaries(): Promise<AccountSummary[]> {
    return this.db.query<AccountSummary>(`
      SELECT
        u.id, u.username, u.display_name AS "displayName", u.role,
        u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt", u.last_seen_at AS "lastSeenAt",
        (SELECT MAX(h.played_at) FROM play_history h WHERE h.user_id = u.id) AS "lastPlayedAt",
        u.disabled_at IS NOT NULL AS disabled,
        COALESCE(u.locked_until > NOW(), FALSE) AS locked,
        (SELECT COUNT(*)::int FROM play_history h
          WHERE h.user_id = u.id AND NOT h.skipped AND h.played_at >= NOW() - INTERVAL '30 days') AS "plays30d",
        (SELECT COUNT(*)::int FROM user_favorites f WHERE f.user_id = u.id) AS "favoriteCount",
        (SELECT COUNT(*)::int FROM playlists p WHERE p.owner_id = u.id) AS "playlistCount"
      FROM users u
      ORDER BY u.role = 'admin' DESC, lower(COALESCE(u.display_name, u.username)), u.username
    `);
  }

  async getSummary(id: string): Promise<AccountSummary | null> {
    return (await this.listSummaries()).find((account) => account.id === id) ?? null;
  }

  private forget(id: string) {
    this.cache.delete(id);
    // Tokens from before accounts are cached under 'owner'.
    this.cache.delete('owner');
  }
}

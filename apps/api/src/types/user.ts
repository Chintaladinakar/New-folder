export type Role = 'admin' | 'listener';

export type UserRecord = {
  id: string;
  username: string;
  displayName: string | null;
  role: Role;
  pinHash: string | null;
  tokenVersion: number;
  failedAttempts: number;
  lockedUntil: Date | null;
  disabledAt: Date | null;
  lastLoginAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Who is making the request; put on res.locals by requireAuth. */
export type SessionUser = Pick<UserRecord, 'id' | 'username' | 'displayName' | 'role'>;

/** An account as the admin panel sees it. Never includes the PIN hash. */
export type AccountSummary = SessionUser & {
  createdAt: Date;
  lastLoginAt: Date | null;
  lastSeenAt: Date | null;
  lastPlayedAt: Date | null;
  disabled: boolean;
  locked: boolean;
  plays30d: number;
  favoriteCount: number;
  playlistCount: number;
};

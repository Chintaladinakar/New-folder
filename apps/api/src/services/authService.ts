import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { MIN_AUTH_SECRET_LENGTH } from '../config/env.js';

export type AuthConfig = {
  password?: string;
  secret?: string;
  tokenTtlDays: number;
};

/** What a valid token says: whose it is, and which generation of that account's sessions. */
export type TokenClaims = {
  /** An account id, or 'owner' in tokens issued before accounts existed (the admin). */
  sub: string;
  /** The account's token_version when issued; absent in tokens from before accounts. */
  v?: number;
};

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest();
const scryptAsync = promisify(scrypt) as (password: Buffer, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;

// N=2^14 takes tens of milliseconds: slow enough to matter, quick enough for a sign-in.
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PIN_HASH_PREFIX = 'scrypt1';

/** Six digits, and not one of the PINs everyone tries first. */
export function pinProblem(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'The PIN must be exactly 6 digits';
  const digits = [...pin].map(Number);
  const steps = new Set(digits.slice(1).map((digit, index) => digit - digits[index]));
  if (steps.size === 1 && [0, 1, -1].includes([...steps][0])) return 'Choose a PIN that is harder to guess';
  return null;
}

/** A random PIN that passes pinProblem(). */
export function generatePin(): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!pinProblem(pin)) return pin;
  }
}

/**
 * Sign-in for the owner (one password) and for listener accounts (username + PIN), with
 * stateless HMAC-signed bearer tokens. The signing key mixes in the password, so changing
 * AUTH_PASSWORD (or AUTH_SECRET) signs out every session.
 */
export class AuthService {
  private readonly signingKey: Buffer | null;
  private readonly pinPepper: Buffer | null;

  constructor(private readonly config: AuthConfig) {
    const usable = config.password && config.secret && config.secret.length >= MIN_AUTH_SECRET_LENGTH;
    this.signingKey = usable ? createHmac('sha256', config.secret!).update(config.password!).digest() : null;
    // PINs are hashed with a key only the server has, so a copy of the database alone is not
    // enough to try all million of them. (Changing AUTH_SECRET therefore invalidates every PIN.)
    this.pinPepper = usable ? createHmac('sha256', config.secret!).update('listener-pin-pepper').digest() : null;
  }

  get isConfigured(): boolean {
    return this.signingKey !== null;
  }

  checkPassword(candidate: string): boolean {
    if (!this.signingKey || !this.config.password) return false;
    // Comparing fixed-length digests keeps the comparison constant-time regardless of input length.
    return timingSafeEqual(sha256(candidate), sha256(this.config.password));
  }

  issueToken(account: { id: string; tokenVersion: number }, now = Date.now()): { token: string; expiresAt: string } {
    if (!this.signingKey) {
      throw new Error('Authentication is not configured');
    }
    const exp = Math.floor(now / 1000) + Math.round(this.config.tokenTtlDays * 86400);
    const payload = Buffer.from(JSON.stringify({ sub: account.id, v: account.tokenVersion, exp })).toString('base64url');
    return { token: `${payload}.${this.sign(payload)}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** The token's claims if it is genuine and unexpired, otherwise null. */
  verifyToken(token: string, now = Date.now()): TokenClaims | null {
    if (!this.signingKey) return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;

    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    try {
      const { sub, v, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
      if (typeof exp !== 'number' || exp * 1000 <= now || typeof sub !== 'string') return null;
      return typeof v === 'number' ? { sub, v } : { sub };
    } catch {
      return null;
    }
  }

  async hashPin(pin: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await this.derive(pin, salt);
    return `${PIN_HASH_PREFIX}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
  }

  async verifyPin(pin: string, stored: string | null): Promise<boolean> {
    const [prefix, salt, hash] = (stored ?? '').split('$');
    if (prefix !== PIN_HASH_PREFIX || !salt || !hash) {
      // Same work as a real check, so a missing account can't be told apart by timing.
      await this.derive(pin, Buffer.alloc(16));
      return false;
    }
    const expected = Buffer.from(hash, 'base64url');
    const actual = await this.derive(pin, Buffer.from(salt, 'base64url'));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private derive(pin: string, salt: Buffer): Promise<Buffer> {
    if (!this.pinPepper) throw new Error('Authentication is not configured');
    return scryptAsync(createHmac('sha256', this.pinPepper).update(pin).digest(), salt, 32, SCRYPT);
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.signingKey as Buffer).update(payload).digest('base64url');
  }
}

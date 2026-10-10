import type { RequestHandler, Response } from 'express';
import { HttpError } from './errors.js';
import type { AuthService } from '../services/authService.js';
import { toSessionUser, type UserService } from '../services/userService.js';
import type { SessionUser } from '../types/user.js';

/** The signed-in account, set by requireAuth. */
export const sessionUser = (res: Response): SessionUser => res.locals.user as SessionUser;

/**
 * A valid token for an account that still exists, isn't disabled, and hasn't had its sessions
 * ended since (a PIN reset or disabling bumps token_version). Puts the account on res.locals.user.
 */
export function requireAuth(auth: AuthService, users: UserService): RequestHandler {
  return async (req, res, next) => {
    if (!auth.isConfigured) {
      res.status(503).json({ message: 'Sign-in is not configured on the server. Set AUTH_PASSWORD and AUTH_SECRET.' });
      return;
    }

    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const claims = token ? auth.verifyToken(token) : null;
    const user = claims ? await users.findForSession(claims.sub) : null;
    // Tokens from before accounts carry no version; they stay valid until the admin's first reset.
    const current = user && !user.disabledAt && (claims?.v ?? 1) === user.tokenVersion;
    if (!user || !current) {
      res.status(401).json({ message: 'Please sign in again' });
      return;
    }

    res.locals.user = toSessionUser(user);
    users.touch(user.id);
    next();
  };
}

/** Admin-only routes: uploads, edits, deletes, server status and account management. */
export const requireAdmin: RequestHandler = (_req, res, next) => {
  assertAdmin(res);
  next();
};

/**
 * The same check inside a handler. Routes with path parameters use this rather than
 * requireAdmin, because chaining a plain RequestHandler widens Express's typing of req.params.
 */
export function assertAdmin(res: Response): void {
  if (sessionUser(res)?.role !== 'admin') throw new HttpError(403, 'Only the admin can do that');
}

/**
 * Fixed-window, per-IP rate limit kept in memory. Good enough for a single API instance;
 * a multi-instance deployment would need a shared store.
 */
export function rateLimit(options: { windowMs: number; max: number; message: string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';

    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (hits.size > 10_000) {
        for (const [ip, value] of hits) {
          if (value.resetAt <= now) hits.delete(ip);
        }
      }
      entry = { count: 0, resetAt: now + options.windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > options.max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ message: options.message });
      return;
    }

    next();
  };
}

const containsNul = (value: unknown, depth = 0): boolean => {
  if (typeof value === 'string') return value.includes('\u0000');
  if (value === null || typeof value !== 'object' || depth > 32) return false;
  return Object.entries(value).some(([key, child]) => key.includes('\u0000') || containsNul(child, depth + 1));
};

/**
 * Postgres cannot store a NUL character in text, and nothing legitimate contains one. Without this,
 * a "%00" in a search, a filter, a name or a file name reaches the database and comes back as a 500.
 */
export const rejectNulBytes: RequestHandler = (req, res, next) => {
  if (/%00/i.test(req.originalUrl) || containsNul(req.query) || containsNul(req.body)) {
    res.status(400).json({ message: 'Text cannot contain null characters' });
    return;
  }
  next();
};

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  next();
};

import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { HttpError } from '../http/errors.js';
import { rateLimit, requireAuth, sessionUser } from '../http/middleware.js';
import { changePinBody, loginBody, pinLoginBody } from '../http/schemas.js';
import { pinProblem } from '../services/authService.js';
import { PIN_LOCK_MS, toSessionUser } from '../services/userService.js';

const notConfigured = () => new HttpError(503, 'Sign-in is not configured on the server. Set AUTH_PASSWORD and AUTH_SECRET.');

export function createAuthRouter(deps: AppDeps): Router {
  const { auth, users } = deps;
  const router = Router();

  /** The owner: the password from AUTH_PASSWORD, for the admin account. The web app offers it at /admin only. */
  router.post(
    '/login',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many sign-in attempts. Try again in a few minutes.' }),
    async (req, res) => {
      if (!auth.isConfigured) throw notConfigured();
      const { password } = loginBody.parse(req.body);
      if (!auth.checkPassword(password)) {
        throw new HttpError(401, 'Incorrect password');
      }
      const admin = await users.getAdmin();
      await users.recordLogin(admin.id);
      res.json({ ...auth.issueToken(admin), user: toSessionUser(admin) });
    },
  );

  /**
   * Listeners: username and 6-digit PIN. A million PINs is not many, so besides the per-address
   * limit, five wrong PINs in a row lock the account for 15 minutes. Unknown usernames and wrong
   * PINs get the same answer, in the same time.
   */
  router.post(
    '/pin',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many sign-in attempts. Try again in a few minutes.' }),
    async (req, res) => {
      if (!auth.isConfigured) throw notConfigured();
      const { username, pin } = pinLoginBody.parse(req.body);
      const user = await users.findByUsername(username);
      const wrong = new HttpError(401, 'Incorrect username or PIN');

      if (!user || user.role !== 'listener') {
        await auth.verifyPin(pin, null);
        throw wrong;
      }
      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        const seconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
        res.set('Retry-After', String(seconds));
        throw new HttpError(429, `Too many wrong PINs. Try again in ${Math.ceil(seconds / 60)} minute${seconds > 60 ? 's' : ''}.`);
      }
      if (!(await auth.verifyPin(pin, user.pinHash))) {
        const { locked } = await users.recordFailedPin(user.id);
        if (locked) {
          res.set('Retry-After', String(PIN_LOCK_MS / 1000));
          throw new HttpError(429, 'Too many wrong PINs. This account is locked for 15 minutes.');
        }
        throw wrong;
      }
      // Only someone who knows the PIN learns that the account is turned off.
      if (user.disabledAt) throw new HttpError(403, 'This account is turned off. Ask whoever set up your account to turn it back on.');

      await users.recordLogin(user.id);
      res.json({ ...auth.issueToken(user), user: toSessionUser(user) });
    },
  );

  router.get('/session', requireAuth(auth, users), (_req, res) => {
    res.json({ ok: true, user: sessionUser(res) });
  });

  /** A listener changes their own PIN. Their other sessions keep working. */
  router.post(
    '/pin/change',
    requireAuth(auth, users),
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many attempts. Try again in a few minutes.' }),
    async (req, res) => {
      const me = sessionUser(res);
      if (me.role !== 'listener') throw new HttpError(400, 'The admin signs in with the server password, not a PIN');
      const { currentPin, newPin } = changePinBody.parse(req.body);
      const user = await users.findById(me.id);
      if (!user || !(await auth.verifyPin(currentPin, user.pinHash))) throw new HttpError(400, 'Your current PIN is not right');
      const problem = pinProblem(newPin);
      if (problem) throw new HttpError(400, problem);
      await users.setPin(me.id, await auth.hashPin(newPin), { endSessions: false });
      res.status(204).end();
    },
  );

  return router;
}

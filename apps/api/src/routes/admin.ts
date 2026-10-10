import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { HttpError, notFound } from '../http/errors.js';
import { createAccountBody, listeningQuery, resetPinBody, updateAccountBody, uuid } from '../http/schemas.js';
import { generatePin, pinProblem } from '../services/authService.js';
import { UsernameTakenError } from '../services/userService.js';

/** Account management. Mounted behind requireAdmin. */
export function createAdminRouter(deps: AppDeps): Router {
  const { auth, users, tracks } = deps;
  const router = Router();

  const accountId = (id: string) => {
    if (!uuid.safeParse(id).success) throw notFound('Account');
    return id;
  };

  /** A PIN the admin typed must pass the same rules as a generated one. */
  const choosePin = (pin: string | undefined) => {
    if (pin === undefined) return generatePin();
    const problem = pinProblem(pin);
    if (problem) throw new HttpError(400, problem);
    return pin;
  };

  router.get('/users', async (_req, res) => {
    res.json({ users: await users.listSummaries() });
  });

  /** Creates a listener. The PIN is returned once, so the admin can pass it on. */
  router.post('/users', async (req, res) => {
    const input = createAccountBody.parse(req.body);
    const pin = choosePin(input.pin);
    try {
      const user = await users.createListener({ username: input.username, displayName: input.displayName ?? null, pinHash: await auth.hashPin(pin) });
      res.status(201).json({ user: await users.getSummary(user.id), pin });
    } catch (error) {
      if (error instanceof UsernameTakenError) throw new HttpError(409, `The username "${input.username}" is taken`);
      throw error;
    }
  });

  router.patch('/users/:id', async (req, res) => {
    const id = accountId(req.params.id);
    const patch = updateAccountBody.parse(req.body);
    const existing = await users.findById(id);
    if (!existing) throw notFound('Account');
    if (existing.role === 'admin' && patch.disabled) throw new HttpError(400, "The admin account can't be turned off");
    await users.update(id, patch);
    res.json({ user: await users.getSummary(id) });
  });

  /** A new PIN for a listener; it signs them out everywhere and is returned once. */
  router.post('/users/:id/pin', async (req, res) => {
    const id = accountId(req.params.id);
    const pin = choosePin(resetPinBody.parse(req.body ?? {}).pin);
    const user = await users.setPin(id, await auth.hashPin(pin), { endSessions: true });
    if (!user) throw notFound('Account');
    res.json({ user: await users.getSummary(id), pin });
  });

  /** Deletes a listener with their favorites, playlists and history. The library is untouched. */
  router.delete('/users/:id', async (req, res) => {
    const id = accountId(req.params.id);
    const existing = await users.findById(id);
    if (!existing) throw notFound('Account');
    if (existing.role === 'admin') throw new HttpError(400, "The admin account can't be deleted");
    await users.delete(id);
    res.status(204).end();
  });

  router.get('/users/:id/listening', async (req, res) => {
    const id = accountId(req.params.id);
    if (!(await users.findById(id))) throw notFound('Account');
    res.json({ listening: await tracks.getListeningStats(id, listeningQuery.parse(req.query).days) });
  });

  return router;
}

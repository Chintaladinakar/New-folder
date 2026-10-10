import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http/errors.js';
import { sessionUser } from '../http/middleware.js';
import { finishPlayBody, playId } from '../http/schemas.js';

export function createPlaysRouter(deps: AppDeps): Router {
  const router = Router();

  /**
   * How a play went, sent by the player when the track ends or is left: the seconds actually
   * listened, and whether it played to the end. Early exits count as skips.
   */
  router.post('/:id/finish', async (req, res) => {
    const id = playId.safeParse(req.params.id);
    if (!id.success) throw notFound('Play');
    const { listenedSeconds, completed } = finishPlayBody.parse(req.body);
    const user = sessionUser(res);
    if (!(await deps.tracks.finishPlay(id.data, user.id, listenedSeconds, completed))) throw notFound('Play');
    deps.recommendations.invalidate(user.id);
    res.status(204).end();
  });

  return router;
}

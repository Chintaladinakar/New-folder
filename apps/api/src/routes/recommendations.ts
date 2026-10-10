import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { notFound } from '../http/errors.js';
import { sessionUser } from '../http/middleware.js';
import { radioQuery } from '../http/schemas.js';
import type { Mix } from '../services/recommend/engine.js';
import type { TrackRecord } from '../types/track.js';

/** Personal mixes, shelves and radio, for the signed-in account. */
export function createRecommendationsRouter(deps: AppDeps): Router {
  const { recommendations, tracks, presenter } = deps;
  const router = Router();

  /** Up to four different covers from the start of a mix, for a collage. */
  const covers = async (mix: Mix, byId: Map<string, TrackRecord>) => {
    const keys = [...new Set(mix.trackIds.map((id) => byId.get(id)?.artworkKey).filter((key): key is string => Boolean(key)))].slice(0, 4);
    return (await Promise.all(keys.map((key) => presenter.signedUrl(key)))).flatMap((signed) => (signed ? [signed.url] : []));
  };

  const summary = async (mix: Mix, byId: Map<string, TrackRecord>) => ({
    id: mix.id,
    kind: mix.kind,
    title: mix.title,
    description: mix.description,
    artists: mix.artists,
    trackCount: mix.trackIds.length,
    duration: mix.trackIds.reduce((sum, id) => sum + (byId.get(id)?.duration ?? 0), 0),
    covers: await covers(mix, byId),
  });

  router.get('/', async (_req, res) => {
    const user = sessionUser(res);
    const home = await recommendations.home(user.id);
    // Mixes are summarised (length, covers) and fetched whole when opened; shelves are sent whole.
    const ids = new Set([...home.mixes.flatMap((mix) => mix.trackIds), ...home.shelves.flatMap((shelf) => shelf.trackIds)]);
    const byId = new Map((await tracks.getTracksByIds([...ids], user.id)).map((track) => [track.id, track]));
    const present = (trackIds: string[]) => presenter.tracks(trackIds.flatMap((id) => byId.get(id) ?? []));

    res.json({
      coldStart: home.coldStart,
      mixes: await Promise.all(home.mixes.map((mix) => summary(mix, byId))),
      shelves: await Promise.all(home.shelves.map(async (shelf) => ({ id: shelf.id, title: shelf.title, tracks: await present(shelf.trackIds) }))),
    });
  });

  router.get('/mixes/:id', async (req, res) => {
    const user = sessionUser(res);
    const mix = await recommendations.mix(user.id, req.params.id);
    if (!mix) throw notFound('Mix');
    const records = await tracks.getTracksByIds(mix.trackIds, user.id);
    const byId = new Map(records.map((track) => [track.id, track]));
    res.json({ mix: await summary(mix, byId), tracks: await presenter.tracks(records) });
  });

  router.get('/radio', async (req, res) => {
    const user = sessionUser(res);
    const query = radioQuery.parse(req.query);
    const station = await recommendations.radio(user.id, query.track ? { trackId: query.track } : { artist: query.artist! });
    if (!station) throw notFound(query.track ? 'Track' : 'Artist');
    res.json({ title: station.title, tracks: await presenter.tracks(await tracks.getTracksByIds(station.trackIds, user.id)) });
  });

  return router;
}

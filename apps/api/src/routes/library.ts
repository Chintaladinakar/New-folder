import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { sessionUser } from '../http/middleware.js';
import { listeningQuery } from '../http/schemas.js';

export function createLibraryRouter(deps: AppDeps): Router {
  const { tracks, presenter } = deps;
  const router = Router();

  router.get('/albums', async (_req, res) => {
    const albums = await tracks.listAlbums();
    res.json({ albums: await Promise.all(albums.map((album) => presenter.withArtwork(album))) });
  });

  router.get('/artists', async (_req, res) => {
    const artists = await tracks.listArtists();
    res.json({ artists: await Promise.all(artists.map((artist) => presenter.withArtwork(artist))) });
  });

  /** The signed-in account's own listening. */
  router.get('/listening', async (req, res) => {
    res.json({ listening: await tracks.getListeningStats(sessionUser(res).id, listeningQuery.parse(req.query).days) });
  });

  router.get('/facets', async (_req, res) => {
    res.json({ facets: await tracks.getFacets() });
  });

  router.get('/stats', async (_req, res) => {
    res.json({ stats: await tracks.getStats(sessionUser(res).id), uploadMaxSizeBytes: deps.uploadMaxSizeBytes });
  });

  return router;
}

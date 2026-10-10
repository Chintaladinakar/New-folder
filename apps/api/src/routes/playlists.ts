import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { HttpError, notFound } from '../http/errors.js';
import { sessionUser } from '../http/middleware.js';
import {
  addPlaylistTracksBody,
  createPlaylistBody,
  reorderPlaylistBody,
  updatePlaylistBody,
  uuid,
} from '../http/schemas.js';

/** Each account's own playlists; another account's playlist answers 404, like one that doesn't exist. */
export function createPlaylistsRouter(deps: AppDeps): Router {
  const { playlists, presenter, recommendations } = deps;
  const router = Router();

  const playlistId = (id: string): string => {
    if (!uuid.safeParse(id).success) throw notFound('Playlist');
    return id;
  };

  router.get('/', async (_req, res) => {
    const all = await playlists.listPlaylists(sessionUser(res).id);
    res.json({ playlists: await Promise.all(all.map((playlist) => presenter.playlist(playlist))) });
  });

  router.post('/', async (req, res) => {
    const input = createPlaylistBody.parse(req.body);
    const playlist = await playlists.createPlaylist(sessionUser(res).id, input.name, input.description ?? null);
    res.status(201).json({ playlist: await presenter.playlist(playlist) });
  });

  router.get('/:id', async (req, res) => {
    const id = playlistId(req.params.id);
    const owner = sessionUser(res).id;
    const playlist = await playlists.getPlaylist(id, owner);
    if (!playlist) throw notFound('Playlist');
    const entries = await playlists.getEntries(id, owner);
    res.json({ playlist: await presenter.playlist(playlist), entries: await presenter.entries(entries) });
  });

  router.patch('/:id', async (req, res) => {
    const id = playlistId(req.params.id);
    const playlist = await playlists.updatePlaylist(id, sessionUser(res).id, updatePlaylistBody.parse(req.body));
    if (!playlist) throw notFound('Playlist');
    res.json({ playlist: await presenter.playlist(playlist) });
  });

  router.delete('/:id', async (req, res) => {
    const owner = sessionUser(res).id;
    if (!(await playlists.deletePlaylist(playlistId(req.params.id), owner))) throw notFound('Playlist');
    recommendations.invalidate(owner);
    res.status(204).end();
  });

  router.post('/:id/tracks', async (req, res) => {
    const { trackIds } = addPlaylistTracksBody.parse(req.body);
    const owner = sessionUser(res).id;
    const added = await playlists.addTracks(playlistId(req.params.id), owner, trackIds);
    if (added === null) throw notFound('Playlist');
    // Some tracks may have been deleted since the page loaded; only "none of them exist" is an error.
    if (added === 0) throw notFound('Track');
    recommendations.invalidate(owner);
    res.status(201).json({ added });
  });

  router.delete('/:id/tracks/:entryId', async (req, res) => {
    const id = playlistId(req.params.id);
    const owner = sessionUser(res).id;
    const removed = uuid.safeParse(req.params.entryId).success && (await playlists.removeEntry(id, owner, req.params.entryId));
    if (!removed) throw notFound('Playlist entry');
    recommendations.invalidate(owner);
    res.status(204).end();
  });

  router.put('/:id/order', async (req, res) => {
    const { entryIds } = reorderPlaylistBody.parse(req.body);
    const result = await playlists.reorder(playlistId(req.params.id), sessionUser(res).id, entryIds);
    if (result === 'not-found') throw notFound('Playlist');
    if (result === 'mismatch') {
      throw new HttpError(409, 'The playlist changed since it was loaded. Refresh and try again.');
    }
    res.status(204).end();
  });

  return router;
}

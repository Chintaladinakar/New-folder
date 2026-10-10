import { randomUUID } from 'crypto';
import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { isUniqueViolation } from '../db/index.js';
import { HttpError, notFound } from '../http/errors.js';
import { assertAdmin, requireAdmin, sessionUser } from '../http/middleware.js';
import { completeUploadBody, listTracksQuery, setLyricsBody, updateTrackBody, uploadUrlBody, uuid } from '../http/schemas.js';
import { storeArtwork } from '../services/artwork.js';
import { fetchLyricsFromLrclib, looksSynced } from '../services/lyricsService.js';
import type { MusicStorage } from '../storage/base.js';
import type { TrackRecord } from '../types/track.js';
import { SUPPORTED_AUDIO_FORMATS, audioMimeTypeFor, getFileExtension } from '../utils/file.js';

const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

export function createTracksRouter(deps: AppDeps): Router {
  const { tracks, metadata, presenter, recommendations } = deps;
  const router = Router();

  const requireStorage = (): MusicStorage => {
    if (!deps.storage) {
      throw new HttpError(503, 'File storage is not configured on the server');
    }
    return deps.storage;
  };

  const loadTrack = async (id: string, userId: string): Promise<TrackRecord> => {
    const track = uuid.safeParse(id).success ? await tracks.getTrackById(id, userId) : null;
    if (!track) throw notFound('Track');
    return track;
  };

  /** Best-effort delete, used when cleaning up after a failed upload. */
  const discard = async (storage: MusicStorage, key: string) => {
    await storage.delete(key).catch((error: Error) => console.error(`Could not delete ${key}: ${error.message}`));
  };

  const duplicateError = async (existing: TrackRecord) =>
    new HttpError(409, `"${existing.title}" is already in your library`, {
      code: 'duplicate',
      track: await presenter.track(existing),
    });

  router.get('/', async (req, res) => {
    const query = listTracksQuery.parse(req.query);
    const sort = query.sort ?? (query.album ? 'album-order' : 'recent');
    const result = await tracks.listTracks({ ...query, sort }, sessionUser(res).id);
    res.json({ tracks: await presenter.tracks(result.tracks), total: result.total });
  });

  router.post('/upload-url', requireAdmin, async (req, res) => {
    const storage = requireStorage();
    const input = uploadUrlBody.parse(req.body);

    const mimeType = audioMimeTypeFor(input.fileName);
    if (!mimeType) {
      throw new HttpError(415, `Unsupported file type. Supported formats: ${SUPPORTED_AUDIO_FORMATS}.`);
    }
    if (input.fileSize > deps.uploadMaxSizeBytes) {
      throw new HttpError(413, `File is larger than the ${megabytes(deps.uploadMaxSizeBytes)} MB upload limit`);
    }
    if (input.contentHash) {
      const existing = await tracks.findByContentHash(input.contentHash, sessionUser(res).id);
      if (existing) throw await duplicateError(existing);
    }

    // The key never contains the user's file name, so nothing needs escaping and keys cannot collide.
    const storageKey = `tracks/${randomUUID()}.${getFileExtension(input.fileName)}`;
    const uploadUrl = await storage.getUploadUrl(storageKey, mimeType);
    res.json({ uploadUrl, storageKey, mimeType });
  });

  router.post('/complete-upload', requireAdmin, async (req, res) => {
    const storage = requireStorage();
    const input = completeUploadBody.parse(req.body);
    const userId = sessionUser(res).id;

    // Completing the same upload twice (a retried request) returns the track created the first time.
    const alreadySaved = await tracks.findByStorageKey(input.storageKey, userId);
    if (alreadySaved) {
      res.json({ track: await presenter.track(alreadySaved) });
      return;
    }

    const mimeType = audioMimeTypeFor(input.storageKey);
    if (!mimeType) {
      throw new HttpError(400, 'Invalid storage key');
    }

    const stored = await storage.head(input.storageKey);
    if (!stored) {
      throw new HttpError(400, 'The uploaded file was not found in storage. Please upload it again.');
    }
    if (stored.size > deps.uploadMaxSizeBytes) {
      await discard(storage, input.storageKey);
      throw new HttpError(413, `File is larger than the ${megabytes(deps.uploadMaxSizeBytes)} MB upload limit`);
    }
    if (input.contentHash) {
      const existing = await tracks.findByContentHash(input.contentHash, userId);
      if (existing) {
        await discard(storage, input.storageKey);
        throw await duplicateError(existing);
      }
    }

    let tags;
    try {
      tags = await metadata.extractMetadataFromStream(
        await storage.getObject(input.storageKey),
        { mimeType, size: stored.size },
        input.fileName,
      );
    } catch (error) {
      console.warn(`Rejected ${input.storageKey}: ${(error as Error).message}`);
      await discard(storage, input.storageKey);
      throw new HttpError(422, 'This file could not be read as audio. It may be damaged or not really an audio file.');
    }

    let artworkKey: string | null = null;
    if (tags.picture) {
      // Missing artwork should never fail an upload.
      artworkKey = await storeArtwork(storage, tags.picture).catch((error: Error) => {
        console.error(`Could not store artwork for ${input.storageKey}: ${error.message}`);
        return null;
      });
    }

    let track: TrackRecord;
    try {
      track = await tracks.createTrack(
        {
          fileName: input.fileName,
          storageKey: input.storageKey,
          mimeType,
          fileSize: stored.size,
          title: tags.title,
          artist: tags.artist,
          album: tags.album,
          albumArtist: tags.albumArtist,
          genre: tags.genre,
          year: tags.year,
          duration: tags.duration,
          trackNumber: tags.trackNumber,
          discNumber: tags.discNumber,
          artworkKey,
          contentHash: input.contentHash ?? null,
          lyrics: tags.lyrics,
          syncedLyrics: tags.syncedLyrics,
        },
        userId,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Lost a race with an identical request.
        const winner =
          (await tracks.findByStorageKey(input.storageKey, userId)) ??
          (input.contentHash ? await tracks.findByContentHash(input.contentHash, userId) : null);
        if (winner?.storageKey === input.storageKey) {
          res.json({ track: await presenter.track(winner) });
          return;
        }
        if (winner) {
          await discard(storage, input.storageKey);
          throw await duplicateError(winner);
        }
      }
      throw error;
    }

    recommendations.invalidateCatalog();
    res.status(201).json({ track: await presenter.track(track) });
  });

  router.get('/:id', async (req, res) => {
    res.json({ track: await presenter.track(await loadTrack(req.params.id, sessionUser(res).id)) });
  });

  router.get('/:id/stream-url', async (req, res) => {
    const storage = requireStorage();
    const track = await loadTrack(req.params.id, sessionUser(res).id);
    const signed = await storage.getSignedUrl(track.storageKey);
    res.json({ url: signed.url, expiresAt: signed.expiresAt.toISOString() });
  });

  /** Favorites are anyone's to set (they are per account); tags are the admin's to edit. */
  router.patch('/:id', async (req, res) => {
    const user = sessionUser(res);
    await loadTrack(req.params.id, user.id);
    const { isFavorite, ...tags } = updateTrackBody.parse(req.body);
    if (Object.keys(tags).length > 0 && user.role !== 'admin') {
      throw new HttpError(403, 'Only the admin can edit track details');
    }

    if (isFavorite !== undefined) {
      if (!(await tracks.setFavorite(user.id, req.params.id, isFavorite))) throw notFound('Track');
      recommendations.invalidate(user.id);
    }
    const track = await tracks.updateTrack(req.params.id, tags, user.id);
    if (!track) throw notFound('Track');
    if (Object.keys(tags).length > 0) recommendations.invalidateCatalog();
    res.json({ track: await presenter.track(track) });
  });

  router.delete('/:id', async (req, res) => {
    assertAdmin(res);
    await loadTrack(req.params.id, sessionUser(res).id);
    const deleted = await tracks.deleteTrack(req.params.id);
    if (!deleted) throw notFound('Track');
    recommendations.invalidateCatalog();

    // The row is gone first, so a storage failure leaves an orphaned file (cleaned up by
    // `npm run cleanup:orphans`) rather than a track that cannot play.
    if (deps.storage) {
      await discard(deps.storage, deleted.storageKey);
      if (deleted.artworkKey && !(await tracks.isArtworkInUse(deleted.artworkKey))) {
        await discard(deps.storage, deleted.artworkKey);
      }
    }
    res.status(204).end();
  });

  const LYRICS_RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

  /**
   * Lyrics from the file's tags, the database, or lrclib.net. A failed lookup is remembered for a
   * week so a library of untagged tracks doesn't hammer the service; `?refresh=1` looks up again.
   */
  router.get('/:id/lyrics', async (req, res) => {
    const track = await loadTrack(req.params.id, sessionUser(res).id);
    const stored = await tracks.getLyrics(track.id);
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const recentlyMissed =
      stored?.source === 'none' && stored.checkedAt !== null && Date.now() - stored.checkedAt.getTime() < LYRICS_RETRY_AFTER_MS;

    if (stored && (stored.lyrics || stored.syncedLyrics) && !(refresh && stored.source !== 'manual')) {
      res.json({ lyrics: stored.lyrics, syncedLyrics: stored.syncedLyrics, source: stored.source });
      return;
    }
    if (recentlyMissed && !refresh) {
      res.json({ lyrics: null, syncedLyrics: null, source: 'none' });
      return;
    }

    let found;
    try {
      found = await fetchLyricsFromLrclib(deps.lyricsFetch ? { ...track } : track, deps.lyricsFetch);
    } catch (error) {
      console.warn(`Lyrics lookup for ${track.id} failed: ${(error as Error).message}`);
      throw new HttpError(502, 'The lyrics service could not be reached. Try again later.');
    }

    const result = found
      ? { lyrics: found.lyrics, syncedLyrics: found.syncedLyrics, source: 'lrclib' as const }
      : { lyrics: null, syncedLyrics: null, source: 'none' as const };
    await tracks.setLyrics(track.id, result);
    res.json(result);
  });

  router.put('/:id/lyrics', async (req, res) => {
    assertAdmin(res);
    const track = await loadTrack(req.params.id, sessionUser(res).id);
    const input = setLyricsBody.parse(req.body);
    // Pasting LRC text into the plain box still works: it is recognised and treated as synced.
    const syncedLyrics = input.syncedLyrics ?? (looksSynced(input.lyrics ?? null) ? (input.lyrics ?? null) : null);
    const lyrics = syncedLyrics && syncedLyrics === input.lyrics ? null : (input.lyrics ?? null);
    const result = { lyrics, syncedLyrics, source: lyrics || syncedLyrics ? ('manual' as const) : ('none' as const) };
    await tracks.setLyrics(track.id, result);
    res.json(result);
  });

  /** A play starts. The answer's playId is used to report how it went (POST /api/plays/:id/finish). */
  router.post('/:id/play', async (req, res) => {
    const userId = sessionUser(res).id;
    const playId = uuid.safeParse(req.params.id).success ? await tracks.recordPlay(req.params.id, userId) : null;
    if (playId === null) throw notFound('Track');
    recommendations.invalidate(userId);
    res.status(201).json({ playId });
  });

  return router;
}

import { createHash } from 'crypto';
import { isUniqueViolation } from '../db/index.js';
import type { MusicStorage } from '../storage/base.js';
import { pictureFromDataUrl, storeArtwork } from './artwork.js';
import type { TrackService } from './trackService.js';

const BATCH_SIZE = 25;

/**
 * Moves cover art that older versions kept as base64 in the database into storage.
 * Safe to run repeatedly; it only touches rows without an artwork_key.
 */
export async function backfillLegacyArtwork(tracks: TrackService, storage: MusicStorage): Promise<{ moved: number; skipped: number }> {
  let moved = 0;
  let skipped = 0;
  const failed = new Set<string>();

  for (;;) {
    const rows = (await tracks.listLegacyArtwork(BATCH_SIZE + failed.size)).filter((row) => !failed.has(row.id));
    if (rows.length === 0) break;

    for (const row of rows) {
      const picture = pictureFromDataUrl(row.artworkUrl);
      const key = picture ? await storeArtwork(storage, picture).catch(() => null) : null;
      if (key) {
        await tracks.setArtworkKey(row.id, key);
        moved += 1;
      } else {
        failed.add(row.id);
        skipped += 1;
      }
    }
  }

  return { moved, skipped };
}

/**
 * Computes the SHA-256 of every stored file that has no content_hash yet, so duplicate detection
 * also covers tracks uploaded before it existed. Downloads each file once.
 */
export async function backfillContentHashes(
  tracks: TrackService,
  storage: MusicStorage,
  log: (message: string) => void = console.log,
): Promise<{ hashed: number; duplicates: number; failed: number }> {
  let hashed = 0;
  let duplicates = 0;
  let failed = 0;
  let afterId: string | null = null;

  for (;;) {
    const rows = await tracks.listMissingHashes(BATCH_SIZE, afterId);
    if (rows.length === 0) break;

    for (const row of rows) {
      afterId = row.id;
      try {
        const hash = createHash('sha256');
        for await (const chunk of await storage.getObject(row.storageKey)) {
          hash.update(chunk as Buffer);
        }
        const digest = hash.digest('hex');
        try {
          await tracks.setContentHash(row.id, digest);
          hashed += 1;
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          const original = await tracks.findByContentHash(digest);
          log(`Track ${row.id} is a duplicate of ${original?.id ?? 'another track'} ("${original?.title ?? '?'}").`);
          duplicates += 1;
        }
      } catch (error) {
        log(`Could not hash track ${row.id}: ${(error as Error).message}`);
        failed += 1;
      }
    }
  }

  return { hashed, duplicates, failed };
}

/**
 * Finds stored files no track points at, such as uploads abandoned before /complete-upload.
 * Objects younger than `minAgeMs` are left alone because they may be uploads still in progress.
 */
export async function findOrphanedObjects(
  tracks: TrackService,
  storage: MusicStorage,
  minAgeMs: number,
): Promise<{ key: string; size: number }[]> {
  const referenced = await tracks.listReferencedKeys();
  const cutoff = Date.now() - minAgeMs;
  const orphans: { key: string; size: number }[] = [];

  for (const prefix of ['tracks/', 'artwork/']) {
    for await (const object of storage.list(prefix)) {
      const oldEnough = !object.lastModified || object.lastModified.getTime() < cutoff;
      if (!referenced.has(object.key) && oldEnough) {
        orphans.push({ key: object.key, size: object.size });
      }
    }
  }

  return orphans;
}

import { readFile } from 'fs/promises';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { defaultMigrationsDir, runMigrations } from '../src/db/migrate.js';
import { backfillContentHashes, backfillLegacyArtwork, findOrphanedObjects } from '../src/services/maintenance.js';
import { TrackService } from '../src/services/trackService.js';
import { FakeStorage, TINY_PNG, createTestDb, makeWav } from './helpers.js';

describe('migrations', () => {
  it('runs every migration once', async () => {
    const { db } = await createTestDb({ migrate: false });
    const first = await runMigrations(db);
    expect(first).toEqual([
      '001_tracks.sql',
      '002_tracks_artwork_favorites.sql',
      '003_playlists.sql',
      '004_lyrics_filters.sql',
      '005_play_history.sql',
      '006_accounts.sql',
    ]);
    expect(await runMigrations(db)).toEqual([]);
  });

  it('upgrades a database created by the original manual setup, keeping its data', async () => {
    const { db } = await createTestDb({ migrate: false });
    // What existing installs have: 001 applied by hand with psql, and no schema_migrations table.
    await db.exec(await readFile(join(defaultMigrationsDir, '001_tracks.sql'), 'utf8'));
    await db.query(
      `INSERT INTO tracks (title, file_name, storage_key, file_size, mime_type, artwork_url)
       VALUES ('Old song', 'old.mp3', 'tracks/1712345-old.mp3', 1234, 'audio/mpeg', $1)`,
      [`data:image/png;base64,${TINY_PNG.toString('base64')}`],
    );

    expect(await runMigrations(db)).toHaveLength(6);

    const tracks = new TrackService(db);
    const { tracks: rows } = await tracks.listTracks({ limit: 10, offset: 0, sort: 'recent' });
    expect(rows).toMatchObject([{ title: 'Old song', fileSize: 1234, isFavorite: false, playCount: 0, artworkKey: null }]);

    // Legacy base64 artwork moves into storage.
    const storage = new FakeStorage();
    expect(await backfillLegacyArtwork(tracks, storage)).toEqual({ moved: 1, skipped: 0 });
    expect(await backfillLegacyArtwork(tracks, storage)).toEqual({ moved: 0, skipped: 0 });
    const upgraded = await tracks.getTrackById(rows[0].id);
    expect(upgraded?.artworkKey).toMatch(/^artwork\/[0-9a-f]{64}\.png$/);
    expect(storage.objects.has(upgraded!.artworkKey!)).toBe(true);
  });

  it('backfills content hashes and reports existing duplicates', async () => {
    const { db } = await createTestDb();
    const tracks = new TrackService(db);
    const storage = new FakeStorage();
    const wav = makeWav();
    for (const key of ['tracks/a.wav', 'tracks/b.wav']) {
      storage.put(key, wav);
      await tracks.createTrack({ title: key, fileName: key, storageKey: key, fileSize: wav.length, mimeType: 'audio/wav' });
    }

    const messages: string[] = [];
    const result = await backfillContentHashes(tracks, storage, (message) => messages.push(message));
    expect(result).toEqual({ hashed: 1, duplicates: 1, failed: 0 });
    expect(messages[0]).toContain('is a duplicate of');
  });

  it('finds storage objects that no track references', async () => {
    const { db } = await createTestDb();
    const tracks = new TrackService(db);
    const storage = new FakeStorage();
    const old = new Date(Date.now() - 48 * 3600 * 1000);
    storage.put('tracks/kept.wav', Buffer.from('x'), 'audio/wav', old);
    storage.put('tracks/abandoned.wav', Buffer.from('x'), 'audio/wav', old);
    storage.put('tracks/in-progress.wav', Buffer.from('x'), 'audio/wav', new Date());
    await tracks.createTrack({ title: 'Kept', fileName: 'k.wav', storageKey: 'tracks/kept.wav', fileSize: 1, mimeType: 'audio/wav' });

    const orphans = await findOrphanedObjects(tracks, storage, 24 * 3600 * 1000);
    expect(orphans.map((orphan) => orphan.key)).toEqual(['tracks/abandoned.wav']);
  });
});

import { createHash } from 'crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/services/authService.js';
import { TEST_PASSWORD, TINY_PNG, createTestApp, makeWav, uploadTrack } from './helpers.js';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

describe('authentication', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await createTestApp();
  });

  it('keeps health public and everything else behind sign-in', async () => {
    const health = await request(ctx.app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ ok: true, database: 'ok', storage: 'configured', auth: 'configured' });

    for (const path of ['/api/tracks', '/api/albums', '/api/playlists', '/api/storage/b2/health']) {
      expect((await request(ctx.app).get(path)).status).toBe(401);
    }
    expect((await request(ctx.app).get('/api/tracks').set('Authorization', 'Bearer forged.token')).status).toBe(401);
  });

  it('signs in with the password and rate-limits guessing', async () => {
    expect((await request(ctx.app).post('/api/auth/login').send({ password: 'nope' })).status).toBe(401);

    const login = await request(ctx.app).post('/api/auth/login').send({ password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    const session = await request(ctx.app).get('/api/auth/session').set('Authorization', `Bearer ${login.body.token}`);
    expect(session.status).toBe(200);

    let last = 0;
    for (let i = 0; i < 10; i += 1) {
      last = (await request(ctx.app).post('/api/auth/login').send({ password: 'nope' })).status;
    }
    expect(last).toBe(429);
  });

  it('answers 503 when sign-in is not configured', async () => {
    const open = await createTestApp({ auth: new AuthService({ tokenTtlDays: 1 }) });
    expect((await request(open.app).get('/api/tracks')).status).toBe(503);
    expect((await request(open.app).post('/api/auth/login').send({ password: 'x' })).status).toBe(503);
  });
});

describe('uploads', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await createTestApp({ uploadMaxSizeBytes: 200_000 });
  });

  it('validates the requested upload', async () => {
    const exe = await ctx.authed.post('/api/tracks/upload-url').send({ fileName: 'virus.exe', fileSize: 10 });
    expect(exe.status).toBe(415);

    const huge = await ctx.authed.post('/api/tracks/upload-url').send({ fileName: 'big.mp3', fileSize: 10_000_000 });
    expect(huge.status).toBe(413);

    const missing = await ctx.authed.post('/api/tracks/upload-url').send({ fileSize: 10 });
    expect(missing.status).toBe(400);

    const ok = await ctx.authed.post('/api/tracks/upload-url').send({ fileName: 'Song Ü.FLAC', fileSize: 1000 });
    expect(ok.status).toBe(200);
    expect(ok.body.mimeType).toBe('audio/flac');
    expect(ok.body.storageKey).toMatch(/^tracks\/[0-9a-f-]{36}\.flac$/);
  });

  it('creates a track from the uploaded file and its tags', async () => {
    const wav = makeWav({ seconds: 3, title: 'Silence', artist: 'Nobody', album: 'Quiet' });
    const response = await uploadTrack(ctx, 'raw-name.wav', wav);

    expect(response.status).toBe(201);
    expect(response.body.track).toMatchObject({
      title: 'Silence',
      artist: 'Nobody',
      album: 'Quiet',
      duration: 3,
      fileName: 'raw-name.wav',
      fileSize: wav.length,
      mimeType: 'audio/wav',
      isFavorite: false,
      artworkUrl: null,
    });
    expect(response.body.track.streamUrl).toContain('https://storage.test/tracks/');
    expect(response.body.track).not.toHaveProperty('storageKey');
    expect(response.body.track).not.toHaveProperty('contentHash');
  });

  it('stores embedded artwork once per image', async () => {
    const first = await uploadTrack(ctx, 'a.wav', makeWav({ title: 'A', picture: TINY_PNG }));
    const second = await uploadTrack(ctx, 'b.wav', makeWav({ title: 'B', seconds: 2, picture: TINY_PNG }));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const artworkKey = `artwork/${sha256(TINY_PNG)}.png`;
    expect(first.body.track.artworkUrl).toContain(artworkKey);
    expect(second.body.track.artworkUrl).toBe(first.body.track.artworkUrl);
    expect([...ctx.storage.objects.keys()].filter((key) => key.startsWith('artwork/'))).toEqual([artworkKey]);
  });

  it('is idempotent when completion is retried', async () => {
    const wav = makeWav();
    const { body } = await ctx.authed.post('/api/tracks/upload-url').send({ fileName: 'a.wav', fileSize: wav.length });
    ctx.storage.put(body.storageKey, wav);
    const complete = () => ctx.authed.post('/api/tracks/complete-upload').send({ fileName: 'a.wav', storageKey: body.storageKey });

    const first = await complete();
    const second = await complete();
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.track.id).toBe(first.body.track.id);
  });

  it('rejects files that are missing, too large or not audio, and cleans up', async () => {
    const neverUploaded = await ctx.authed
      .post('/api/tracks/complete-upload')
      .send({ fileName: 'a.wav', storageKey: 'tracks/00000000-0000-4000-8000-000000000000.wav' });
    expect(neverUploaded.status).toBe(400);

    const badKey = await ctx.authed.post('/api/tracks/complete-upload').send({ fileName: 'a.wav', storageKey: '../etc/passwd' });
    expect(badKey.status).toBe(400);

    const junk = await uploadTrack(ctx, 'fake.mp3', Buffer.from('not audio at all '.repeat(100)));
    expect(junk.status).toBe(422);

    // The browser lied about the size: the object in storage is over the limit.
    const { body } = await ctx.authed.post('/api/tracks/upload-url').send({ fileName: 'a.wav', fileSize: 10 });
    ctx.storage.put(body.storageKey, makeWav({ seconds: 20 }));
    const oversized = await ctx.authed.post('/api/tracks/complete-upload').send({ fileName: 'a.wav', storageKey: body.storageKey });
    expect(oversized.status).toBe(413);

    expect([...ctx.storage.objects.keys()]).toEqual([]);
  });

  it('detects duplicates by content hash before and after upload', async () => {
    const wav = makeWav({ title: 'Once' });
    const hash = sha256(wav);
    expect((await uploadTrack(ctx, 'once.wav', wav, hash)).status).toBe(201);

    const before = await ctx.authed.post('/api/tracks/upload-url').send({ fileName: 'again.wav', fileSize: wav.length, contentHash: hash });
    expect(before.status).toBe(409);
    expect(before.body).toMatchObject({ code: 'duplicate', track: { title: 'Once' } });

    // Someone skipped the first check: the second file is uploaded, then rejected and removed.
    const sneaky = await ctx.authed.post('/api/tracks/upload-url').send({ fileName: 'again.wav', fileSize: wav.length });
    ctx.storage.put(sneaky.body.storageKey, wav);
    const after = await ctx.authed
      .post('/api/tracks/complete-upload')
      .send({ fileName: 'again.wav', storageKey: sneaky.body.storageKey, contentHash: hash });
    expect(after.status).toBe(409);
    expect(ctx.storage.objects.has(sneaky.body.storageKey)).toBe(false);
  });

  it('answers 503 for uploads when storage is not configured', async () => {
    const noStorage = await createTestApp({ storage: null });
    const response = await noStorage.authed.post('/api/tracks/upload-url').send({ fileName: 'a.mp3', fileSize: 10 });
    expect(response.status).toBe(503);
  });
});

describe('library', () => {
  let ctx: Ctx;
  const ids: Record<string, string> = {};

  beforeEach(async () => {
    ctx = await createTestApp();
    const songs = [
      { file: 'a.wav', title: 'Alpha', artist: 'Band', album: 'First' },
      { file: 'b.wav', title: 'Beta', artist: 'Band', album: 'First' },
      { file: 'c.wav', title: 'Gamma 100%', artist: 'Solo', album: 'Second' },
    ];
    for (const [index, song] of songs.entries()) {
      const response = await uploadTrack(ctx, song.file, makeWav({ ...song, seconds: index + 1 }));
      ids[song.title] = response.body.track.id;
    }
  });

  it('lists, pages, searches and filters', async () => {
    const all = await ctx.authed.get('/api/tracks');
    expect(all.body.total).toBe(3);
    expect(all.body.tracks.map((t: { title: string }) => t.title)).toEqual(['Gamma 100%', 'Beta', 'Alpha']);

    const page = await ctx.authed.get('/api/tracks?limit=2&offset=2&sort=title');
    expect(page.body).toMatchObject({ total: 3, tracks: [{ title: 'Gamma 100%' }] });

    const search = await ctx.authed.get('/api/tracks?q=100%25');
    expect(search.body.tracks.map((t: { title: string }) => t.title)).toEqual(['Gamma 100%']);

    const byArtist = await ctx.authed.get(`/api/tracks?artist=Band&sort=title`);
    expect(byArtist.body.tracks.map((t: { title: string }) => t.title)).toEqual(['Alpha', 'Beta']);

    const byAlbum = await ctx.authed.get(`/api/tracks?album=First&albumArtist=Band`);
    expect(byAlbum.body.total).toBe(2);

    expect((await ctx.authed.get('/api/tracks?limit=9999')).status).toBe(400);
    expect((await ctx.authed.get('/api/tracks?sort=nope')).status).toBe(400);
  });

  it('returns 404 for unknown or malformed ids', async () => {
    expect((await ctx.authed.get('/api/tracks/not-a-uuid')).status).toBe(404);
    expect((await ctx.authed.get('/api/tracks/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await ctx.authed.get(`/api/tracks/${ids.Alpha}`)).body.track.title).toBe('Alpha');
  });

  it('edits metadata and favourites', async () => {
    const favorite = await ctx.authed.patch(`/api/tracks/${ids.Alpha}`).send({ isFavorite: true, year: 2001, genre: '' });
    expect(favorite.status).toBe(200);
    expect(favorite.body.track).toMatchObject({ isFavorite: true, year: 2001, genre: null });

    const favorites = await ctx.authed.get('/api/tracks?favorite=true');
    expect(favorites.body.tracks.map((t: { id: string }) => t.id)).toEqual([ids.Alpha]);

    expect((await ctx.authed.patch(`/api/tracks/${ids.Alpha}`).send({ title: '  ' })).status).toBe(400);
    expect((await ctx.authed.patch(`/api/tracks/${ids.Alpha}`).send({ storageKey: 'x' })).status).toBe(400);
  });

  it('records plays and serves stream URLs', async () => {
    const play = await ctx.authed.post(`/api/tracks/${ids.Beta}/play`);
    expect(play.status).toBe(201);
    expect(play.body.playId).toEqual(expect.any(Number));
    const played = await ctx.authed.get('/api/tracks?played=true&sort=played');
    expect(played.body.tracks).toMatchObject([{ title: 'Beta', playCount: 1 }]);

    const stream = await ctx.authed.get(`/api/tracks/${ids.Beta}/stream-url`);
    expect(stream.body.url).toContain('https://storage.test/tracks/');
  });

  it('summarises albums, artists and totals', async () => {
    const albums = await ctx.authed.get('/api/albums');
    expect(albums.body.albums).toMatchObject([
      { name: 'First', artist: 'Band', trackCount: 2, duration: 3 },
      { name: 'Second', artist: 'Solo', trackCount: 1 },
    ]);

    const artists = await ctx.authed.get('/api/artists');
    expect(artists.body.artists).toMatchObject([
      { name: 'Band', trackCount: 2, albumCount: 1 },
      { name: 'Solo', trackCount: 1, albumCount: 1 },
    ]);

    const stats = await ctx.authed.get('/api/stats');
    expect(stats.body.stats).toMatchObject({ trackCount: 3, albumCount: 2, artistCount: 2, totalDuration: 6 });
    expect(stats.body.stats.totalBytes).toBeGreaterThan(0);
  });

  it('deletes the track and its files', async () => {
    const keysBefore = ctx.storage.objects.size;
    expect((await ctx.authed.delete(`/api/tracks/${ids.Alpha}`)).status).toBe(204);
    expect((await ctx.authed.get(`/api/tracks/${ids.Alpha}`)).status).toBe(404);
    expect(ctx.storage.objects.size).toBe(keysBefore - 1);
    expect((await ctx.authed.delete(`/api/tracks/${ids.Alpha}`)).status).toBe(404);
  });
});

describe('playlists', () => {
  it('supports the full playlist lifecycle', async () => {
    const ctx = await createTestApp();
    const one = (await uploadTrack(ctx, '1.wav', makeWav({ title: 'One' }))).body.track.id;
    const two = (await uploadTrack(ctx, '2.wav', makeWav({ title: 'Two', seconds: 2 }))).body.track.id;

    const created = await ctx.authed.post('/api/playlists').send({ name: 'Road trip' });
    expect(created.status).toBe(201);
    const id = created.body.playlist.id;

    const added = await ctx.authed.post(`/api/playlists/${id}/tracks`).send({ trackIds: [one, two, one] });
    expect(added.body.added).toBe(3);

    let detail = await ctx.authed.get(`/api/playlists/${id}`);
    expect(detail.body.playlist).toMatchObject({ name: 'Road trip', trackCount: 3, duration: 4 });
    const entries = detail.body.entries as { entryId: string; track: { title: string } }[];
    expect(entries.map((entry) => entry.track.title)).toEqual(['One', 'Two', 'One']);

    const reversed = entries.map((entry) => entry.entryId).reverse();
    expect((await ctx.authed.put(`/api/playlists/${id}/order`).send({ entryIds: reversed })).status).toBe(204);
    expect((await ctx.authed.put(`/api/playlists/${id}/order`).send({ entryIds: reversed.slice(1) })).status).toBe(409);

    // Order is now [One (3rd), Two, One (1st)]; remove the entry that was originally first.
    expect((await ctx.authed.delete(`/api/playlists/${id}/tracks/${entries[0].entryId}`)).status).toBe(204);
    detail = await ctx.authed.get(`/api/playlists/${id}`);
    expect(detail.body.entries.map((entry: { entryId: string }) => entry.entryId)).toEqual([
      entries[2].entryId,
      entries[1].entryId,
    ]);

    // Deleting a track removes it from playlists too.
    await ctx.authed.delete(`/api/tracks/${two}`);
    detail = await ctx.authed.get(`/api/playlists/${id}`);
    expect(detail.body.playlist.trackCount).toBe(1);

    const renamed = await ctx.authed.patch(`/api/playlists/${id}`).send({ name: 'Commute', description: 'Mornings' });
    expect(renamed.body.playlist).toMatchObject({ name: 'Commute', description: 'Mornings' });

    expect((await ctx.authed.get('/api/playlists')).body.playlists).toHaveLength(1);
    expect((await ctx.authed.delete(`/api/playlists/${id}`)).status).toBe(204);
    expect((await ctx.authed.get(`/api/playlists/${id}`)).status).toBe(404);
  });
});

describe('error handling', () => {
  it('never sends internal error details to the client', async () => {
    const ctx = await createTestApp();
    ctx.deps.tracks.listTracks = async () => {
      throw new Error('connection to db.internal:5432 failed for user admin');
    };
    const original = console.error;
    console.error = () => undefined;
    try {
      const response = await ctx.authed.get('/api/tracks');
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('db.internal');
    } finally {
      console.error = original;
    }
  });

  it('rejects malformed JSON with 400', async () => {
    const ctx = await createTestApp();
    const response = await ctx.authed.post('/api/playlists').set('Content-Type', 'application/json').send('{"name":');
    expect(response.status).toBe(400);
  });
});

describe('listening history', () => {
  it('records each play with the genre at the time, and survives edits and deletes', async () => {
    const ctx = await createTestApp();
    const jazz = (await uploadTrack(ctx, 'a.wav', makeWav({ title: 'Jazzy', artist: 'Trio', seconds: 2 }))).body.track.id;
    const plain = (await uploadTrack(ctx, 'b.wav', makeWav({ title: 'Plain', artist: 'Solo', seconds: 1 }))).body.track.id;
    await ctx.authed.patch(`/api/tracks/${jazz}`).send({ genre: 'Jazz' });

    for (const id of [jazz, jazz, plain]) await ctx.authed.post(`/api/tracks/${id}/play`);
    // Re-tagging afterwards must not rewrite history, and neither must deleting the track.
    await ctx.authed.patch(`/api/tracks/${jazz}`).send({ genre: 'Blues' });
    await ctx.authed.delete(`/api/tracks/${plain}`);

    const { listening } = (await ctx.authed.get('/api/listening?days=7')).body;
    expect(listening).toMatchObject({ days: 7, plays: 3, seconds: 5 });
    expect(listening.genres).toEqual([
      { name: 'Jazz', plays: 2, seconds: 4 },
      { name: 'Unknown', plays: 1, seconds: 1 },
    ]);
    expect(listening.artists).toEqual([
      { name: 'Trio', plays: 2 },
      { name: 'Solo', plays: 1 },
    ]);
    expect((await ctx.authed.get('/api/listening?days=0')).status).toBe(400);
    expect((await ctx.authed.post('/api/tracks/00000000-0000-4000-8000-000000000000/play')).status).toBe(404);
  });
});

describe('null characters', () => {
  it('are refused with a 400 everywhere text is accepted, never a 500', async () => {
    const ctx = await createTestApp();
    const track = (await uploadTrack(ctx, 'a.wav', makeWav({ title: 'Real' }))).body.track.id;

    // Query string, in several encodings.
    for (const query of ['q=%00', 'artist=a%00b', 'genre=%00', 'q=a%00', 'album=%00x']) {
      expect((await ctx.authed.get(`/api/tracks?${query}`)).status, query).toBe(400);
    }
    // Path.
    expect((await ctx.authed.get('/api/tracks/%00')).status).toBe(400);
    // JSON bodies, including nested values and keys.
    const bodies: [string, string, Record<string, unknown>][] = [
      ['patch', `/api/tracks/${track}`, { title: 'a\u0000b' }],
      ['playlist', '/api/playlists', { name: 'a\u0000b' }],
      ['playlist description', '/api/playlists', { name: 'ok', description: '\u0000' }],
      ['upload-url', '/api/tracks/upload-url', { fileName: 'a\u0000.wav', fileSize: 10 }],
      ['complete-upload', '/api/tracks/complete-upload', { fileName: 'a\u0000.wav', storageKey: 'tracks/00000000-0000-4000-8000-000000000000.wav' }],
      ['nested', '/api/playlists', { name: 'ok', extra: { deep: ['\u0000'] } }],
      ['key', '/api/playlists', { name: 'ok', 'k\u0000ey': 1 }],
    ];
    for (const [label, url, body] of bodies) {
      const method = label === 'patch' ? 'patch' : 'post';
      expect((await ctx.authed[method](url).send(body)).status, label).toBe(400);
    }
    expect((await ctx.authed.put(`/api/tracks/${track}/lyrics`).send({ lyrics: 'la\u0000la' })).status).toBe(400);
    // The sign-in route is public, so it needs the same protection.
    expect((await request(ctx.app).post('/api/auth/login').send({ password: 'a\u0000b' })).status).toBe(400);
    // And ordinary text, including a literal percent sign, still works.
    expect((await ctx.authed.get('/api/tracks?q=100%25')).status).toBe(200);
    expect((await ctx.authed.patch(`/api/tracks/${track}`).send({ title: 'Fine ✓' })).status).toBe(200);
  });

  it('give a readable file-name error instead of a schema message', async () => {
    const ctx = await createTestApp();
    const response = await ctx.authed.post('/api/tracks/upload-url').send({ fileName: `${'x'.repeat(256)}.wav`, fileSize: 10 });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('File name is too long (255 characters at most)');
  });
});

describe('adding to a playlist', () => {
  it('says so when none of the tracks exist, but tolerates some having been deleted', async () => {
    const ctx = await createTestApp();
    const real = (await uploadTrack(ctx, 'a.wav', makeWav({ title: 'Real' }))).body.track.id;
    const playlist = (await ctx.authed.post('/api/playlists').send({ name: 'P' })).body.playlist.id;
    const ghost = '00000000-0000-4000-8000-000000000000';

    const none = await ctx.authed.post(`/api/playlists/${playlist}/tracks`).send({ trackIds: [ghost] });
    expect(none.status).toBe(404);
    const some = await ctx.authed.post(`/api/playlists/${playlist}/tracks`).send({ trackIds: [ghost, real] });
    expect(some.status).toBe(201);
    expect(some.body.added).toBe(1);
  });
});

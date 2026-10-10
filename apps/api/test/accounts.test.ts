import { createHmac } from 'crypto';
import { copyFile, mkdtemp, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { defaultMigrationsDir, runMigrations } from '../src/db/migrate.js';
import { buildDeps } from '../src/deps.js';
import { AuthService } from '../src/services/authService.js';
import { FakeStorage, TEST_PASSWORD, TEST_SECRET, createListener, createTestApp, createTestDb, makeWav, uploadTrack } from './helpers.js';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;

const pinLogin = (ctx: Ctx, username: string, pin: string) => request(ctx.app).post('/api/auth/pin').send({ username, pin });

async function seedTracks(ctx: Ctx, songs: { title: string; artist: string; album: string; genre?: string }[]) {
  const ids: Record<string, string> = {};
  for (const [index, song] of songs.entries()) {
    const created = await uploadTrack(ctx, `${index}.wav`, makeWav({ title: song.title, artist: song.artist, album: song.album, seconds: 1 + (index % 3) }));
    ids[song.title] = created.body.track.id;
    if (song.genre) await ctx.authed.patch(`/api/tracks/${ids[song.title]}`).send({ genre: song.genre });
  }
  return ids;
}

describe('upgrading an existing library', () => {
  it("moves the owner's favorites, plays, history and playlists to the admin account", async () => {
    // A database at migration 005, as every install had before accounts.
    const { db } = await createTestDb({ migrate: false });
    const before = await mkdtemp(join(tmpdir(), 'migrations-'));
    for (const name of (await readdir(defaultMigrationsDir)).filter((file) => file < '006')) {
      await copyFile(join(defaultMigrationsDir, name), join(before, name));
    }
    expect(await runMigrations(db, before)).toHaveLength(5);

    const insert = (title: string, extra: string) =>
      db.query<{ id: string }>(
        `INSERT INTO tracks (title, artist, file_name, storage_key, file_size, mime_type ${extra ? `, ${extra.split('=')[0]}` : ''})
         VALUES ($1, 'Band', $2, $3, 10, 'audio/wav' ${extra ? `, ${extra.split('=')[1]}` : ''}) RETURNING id`,
        [title, `${title}.wav`, `tracks/${title}.wav`],
      );
    const [loved] = await insert('Loved', 'is_favorite=TRUE');
    const [played] = await insert('Played', 'play_count=3');
    await db.query("UPDATE tracks SET last_played_at = NOW() - INTERVAL '1 day' WHERE id = $1", [played.id]);
    for (let i = 0; i < 3; i += 1) {
      await db.query("INSERT INTO play_history (track_id, genre, artist, duration) VALUES ($1, 'Rock', 'Band', 100)", [played.id]);
    }
    const [playlist] = await db.query<{ id: string }>("INSERT INTO playlists (name) VALUES ('Old mix') RETURNING id");
    await db.query('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES ($1, $2, 1), ($1, $3, 2)', [playlist.id, loved.id, played.id]);

    expect(await runMigrations(db)).toEqual(['006_accounts.sql']);

    const auth = new AuthService({ password: TEST_PASSWORD, secret: TEST_SECRET, tokenTtlDays: 1 });
    const app = createApp(buildDeps(db, new FakeStorage(), auth, 1_000_000), { corsOrigins: [], trustProxy: 0 });
    const { token } = (await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD })).body;
    const get = (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`);

    expect((await get('/api/tracks?favorite=true')).body.tracks.map((t: { title: string }) => t.title)).toEqual(['Loved']);
    expect((await get(`/api/tracks/${played.id}`)).body.track).toMatchObject({ playCount: 3, isFavorite: false });
    expect((await get('/api/tracks?played=true')).body.total).toBe(1);
    expect((await get('/api/listening?days=7')).body.listening).toMatchObject({ plays: 3, artists: [{ name: 'Band', plays: 3 }] });
    const playlists = (await get('/api/playlists')).body.playlists;
    expect(playlists).toMatchObject([{ name: 'Old mix', trackCount: 2 }]);

    // A build from before accounts, still running against this database, keeps working: what it
    // writes without an account belongs to the admin.
    await db.query("INSERT INTO play_history (track_id, genre, artist, duration) VALUES ($1, 'Rock', 'Band', 100)", [played.id]);
    await db.query("INSERT INTO playlists (name) VALUES ('From the old app')");
    expect((await get('/api/listening?days=7')).body.listening.plays).toBe(4);
    expect((await get('/api/playlists')).body.playlists.map((p: { name: string }) => p.name)).toContain('From the old app');
  });
});

describe('signing in', () => {
  it('lets a listener in with their username and PIN, and keeps the owner on the password', async () => {
    const ctx = await createTestApp();
    await ctx.authed.post('/api/admin/users').send({ username: 'Asha', displayName: 'Asha R', pin: '902817' });

    const login = await pinLogin(ctx, ' ASHA ', '902817');
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ username: 'asha', displayName: 'Asha R', role: 'listener' });
    const session = await ctx.as(login.body.token).get('/api/auth/session');
    expect(session.body.user).toMatchObject({ username: 'asha', role: 'listener' });

    const owner = await request(ctx.app).post('/api/auth/login').send({ password: TEST_PASSWORD });
    expect(owner.body.user).toMatchObject({ username: 'admin', role: 'admin' });

    // The admin account has no PIN, and wrong PINs, unknown names and odd input all get the same answer.
    for (const [username, pin] of [['asha', '000001'], ['nobody', '902817'], ['admin', '902817'], ['asha', '9028170'], ['asha', 'abc']]) {
      const response = await pinLogin(ctx, username, pin);
      expect(response.status, `${username}/${pin}`).toBe(401);
      expect(response.body.message).toBe('Incorrect username or PIN');
    }
  });

  it('locks an account after five wrong PINs in a row', async () => {
    const ctx = await createTestApp();
    const listener = await createListener(ctx, 'ravi');
    for (let i = 0; i < 4; i += 1) expect((await pinLogin(ctx, 'ravi', '111222')).status).toBe(401);
    const fifth = await pinLogin(ctx, 'ravi', '111222');
    expect(fifth.status).toBe(429);
    expect(fifth.body.message).toMatch(/locked for 15 minutes/);

    // Even the right PIN waits; the admin sees the lock.
    expect((await pinLogin(ctx, 'ravi', '902817')).status).toBe(429);
    const accounts = (await ctx.authed.get('/api/admin/users')).body.users;
    expect(accounts.find((account: { id: string }) => account.id === listener.id)).toMatchObject({ locked: true });

    // When the lock runs out, the right PIN works and the count starts again.
    await ctx.db.query("UPDATE users SET locked_until = NOW() - INTERVAL '1 second' WHERE id = $1", [listener.id]);
    expect((await pinLogin(ctx, 'ravi', '902817')).status).toBe(200);
  });

  it('ends sessions when the admin resets a PIN, turns an account off, or deletes it', async () => {
    const ctx = await createTestApp();
    const listener = await createListener(ctx, 'meera');
    expect((await listener.client.get('/api/tracks')).status).toBe(200);

    const reset = await ctx.authed.post(`/api/admin/users/${listener.id}/pin`).send({});
    expect(reset.status).toBe(200);
    expect(reset.body.pin).toMatch(/^\d{6}$/);
    expect((await listener.client.get('/api/tracks')).status).toBe(401);
    expect((await pinLogin(ctx, 'meera', '902817')).status).toBe(401);
    const again = await pinLogin(ctx, 'meera', reset.body.pin);
    expect(again.status).toBe(200);

    expect((await ctx.authed.patch(`/api/admin/users/${listener.id}`).send({ disabled: true })).body.user).toMatchObject({ disabled: true });
    expect((await ctx.as(again.body.token).get('/api/tracks')).status).toBe(401);
    const refused = await pinLogin(ctx, 'meera', reset.body.pin);
    expect(refused.status).toBe(403);
    expect(refused.body.message).toMatch(/turned off/);

    await ctx.authed.patch(`/api/admin/users/${listener.id}`).send({ disabled: false });
    const back = await pinLogin(ctx, 'meera', reset.body.pin);
    expect(back.status).toBe(200);

    expect((await ctx.authed.delete(`/api/admin/users/${listener.id}`)).status).toBe(204);
    expect((await ctx.as(back.body.token).get('/api/tracks')).status).toBe(401);
    expect((await pinLogin(ctx, 'meera', reset.body.pin)).status).toBe(401);
  });

  it('lets a listener change their own PIN', async () => {
    const ctx = await createTestApp();
    const listener = await createListener(ctx, 'kiran');
    expect((await listener.client.post('/api/auth/pin/change').send({ currentPin: '000000', newPin: '582049' })).status).toBe(400);
    expect((await listener.client.post('/api/auth/pin/change').send({ currentPin: '902817', newPin: '123456' })).status).toBe(400);
    expect((await listener.client.post('/api/auth/pin/change').send({ currentPin: '902817', newPin: '582049' })).status).toBe(204);
    expect((await listener.client.get('/api/tracks')).status).toBe(200);
    expect((await pinLogin(ctx, 'kiran', '902817')).status).toBe(401);
    expect((await pinLogin(ctx, 'kiran', '582049')).status).toBe(200);
    expect((await ctx.authed.post('/api/auth/pin/change').send({ currentPin: '1', newPin: '582049' })).status).toBe(400);
  });

  it('still accepts an owner token issued before accounts existed', async () => {
    const ctx = await createTestApp();
    // What the old AuthService issued: { sub: 'owner', exp }, signed with the same key.
    const payload = Buffer.from(JSON.stringify({ sub: 'owner', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const key = createHmac('sha256', TEST_SECRET).update(TEST_PASSWORD).digest();
    const legacy = `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`;
    const session = await ctx.as(legacy).get('/api/auth/session');
    expect(session.status).toBe(200);
    expect(session.body.user).toMatchObject({ role: 'admin' });
  });
});

describe('managing accounts', () => {
  it('validates new accounts and protects the admin account', async () => {
    const ctx = await createTestApp();
    const created = await ctx.authed.post('/api/admin/users').send({ username: 'priya', displayName: 'Priya' });
    expect(created.status).toBe(201);
    expect(created.body.pin).toMatch(/^\d{6}$/);
    expect(created.body.user).toMatchObject({ username: 'priya', displayName: 'Priya', role: 'listener', disabled: false, plays30d: 0 });
    expect(created.body.user).not.toHaveProperty('pinHash');

    expect((await ctx.authed.post('/api/admin/users').send({ username: 'PRIYA' })).status).toBe(409);
    expect((await ctx.authed.post('/api/admin/users').send({ username: 'admin' })).status).toBe(409);
    for (const username of ['ab', 'has space', '-dash', 'x'.repeat(33), 'émile']) {
      expect((await ctx.authed.post('/api/admin/users').send({ username })).status, username).toBe(400);
    }
    expect((await ctx.authed.post('/api/admin/users').send({ username: 'sam', pin: '111111' })).status).toBe(400);
    expect((await ctx.authed.post('/api/admin/users').send({ username: 'sam', pin: '12345' })).status).toBe(400);
    expect((await ctx.authed.post('/api/admin/users').send({ username: 'sam', role: 'admin' })).status).toBe(400);

    const renamed = await ctx.authed.patch(`/api/admin/users/${created.body.user.id}`).send({ displayName: '  Priya K ' });
    expect(renamed.body.user.displayName).toBe('Priya K');

    const accounts = (await ctx.authed.get('/api/admin/users')).body.users;
    expect(accounts.map((account: { username: string }) => account.username)).toEqual(['admin', 'priya']);
    expect((await ctx.authed.patch(`/api/admin/users/${ctx.admin.id}`).send({ disabled: true })).status).toBe(400);
    expect((await ctx.authed.delete(`/api/admin/users/${ctx.admin.id}`)).status).toBe(400);
    expect((await ctx.authed.post(`/api/admin/users/${ctx.admin.id}/pin`).send({})).status).toBe(404);
    expect((await ctx.authed.delete('/api/admin/users/not-a-uuid')).status).toBe(404);
  });
});

describe('what a listener can do', () => {
  it('plays and personalises, but never changes the library', async () => {
    const ctx = await createTestApp();
    const ids = await seedTracks(ctx, [{ title: 'One', artist: 'A', album: 'X' }]);
    const listener = await createListener(ctx, 'guest');
    const as = listener.client;
    const id = ids.One;

    const refused: [string, () => request.Test][] = [
      ['upload-url', () => as.post('/api/tracks/upload-url').send({ fileName: 'a.wav', fileSize: 10 })],
      ['complete-upload', () => as.post('/api/tracks/complete-upload').send({ fileName: 'a.wav', storageKey: 'tracks/00000000-0000-4000-8000-000000000000.wav' })],
      ['edit tags', () => as.patch(`/api/tracks/${id}`).send({ title: 'Mine now' })],
      ['tags with a favorite', () => as.patch(`/api/tracks/${id}`).send({ isFavorite: true, genre: 'Pop' })],
      ['delete', () => as.delete(`/api/tracks/${id}`)],
      ['edit lyrics', () => as.put(`/api/tracks/${id}/lyrics`).send({ lyrics: 'la la' })],
      ['storage health', () => as.get('/api/storage/b2/health')],
      ['list accounts', () => as.get('/api/admin/users')],
      ['create account', () => as.post('/api/admin/users').send({ username: 'sneaky' })],
    ];
    for (const [label, call] of refused) expect((await call()).status, label).toBe(403);
    expect((await ctx.authed.get(`/api/tracks/${id}`)).body.track.title).toBe('One');

    expect((await as.get('/api/tracks')).body.total).toBe(1);
    expect((await as.get(`/api/tracks/${id}/stream-url`)).status).toBe(200);
    expect((await as.get(`/api/tracks/${id}/lyrics`)).status).toBe(200);
    expect((await as.patch(`/api/tracks/${id}`).send({ isFavorite: true })).body.track.isFavorite).toBe(true);
    expect((await as.post(`/api/tracks/${id}/play`)).status).toBe(201);
    expect((await as.get('/api/recommendations')).status).toBe(200);
  });

  it('keeps favorites, plays, history and playlists separate per account', async () => {
    const ctx = await createTestApp();
    const ids = await seedTracks(ctx, [
      { title: 'One', artist: 'A', album: 'X' },
      { title: 'Two', artist: 'B', album: 'Y' },
    ]);
    const listener = await createListener(ctx, 'guest');

    await listener.client.patch(`/api/tracks/${ids.One}`).send({ isFavorite: true });
    await ctx.authed.patch(`/api/tracks/${ids.Two}`).send({ isFavorite: true });
    await listener.client.post(`/api/tracks/${ids.One}/play`);
    await listener.client.post(`/api/tracks/${ids.One}/play`);

    const mine = (await listener.client.get('/api/tracks?favorite=true')).body.tracks;
    const theirs = (await ctx.authed.get('/api/tracks?favorite=true')).body.tracks;
    expect(mine.map((t: { title: string }) => t.title)).toEqual(['One']);
    expect(theirs.map((t: { title: string }) => t.title)).toEqual(['Two']);
    expect((await listener.client.get(`/api/tracks/${ids.One}`)).body.track.playCount).toBe(2);
    expect((await ctx.authed.get(`/api/tracks/${ids.One}`)).body.track.playCount).toBe(0);
    expect((await listener.client.get('/api/stats')).body.stats.favoriteCount).toBe(1);
    expect((await listener.client.get('/api/listening?days=7')).body.listening.plays).toBe(2);
    expect((await ctx.authed.get('/api/listening?days=7')).body.listening.plays).toBe(0);
    expect((await ctx.authed.get('/api/tracks?played=true')).body.total).toBe(0);

    // A playlist is invisible, and untouchable, to everyone but its owner.
    const playlist = (await listener.client.post('/api/playlists').send({ name: 'Mine' })).body.playlist.id;
    await listener.client.post(`/api/playlists/${playlist}/tracks`).send({ trackIds: [ids.One] });
    expect((await ctx.authed.get('/api/playlists')).body.playlists).toEqual([]);
    for (const call of [
      () => ctx.authed.get(`/api/playlists/${playlist}`),
      () => ctx.authed.patch(`/api/playlists/${playlist}`).send({ name: 'Taken' }),
      () => ctx.authed.post(`/api/playlists/${playlist}/tracks`).send({ trackIds: [ids.Two] }),
      () => ctx.authed.put(`/api/playlists/${playlist}/order`).send({ entryIds: [] }),
      () => ctx.authed.delete(`/api/playlists/${playlist}`),
    ]) {
      expect((await call()).status).toBe(404);
    }
    const entry = (await listener.client.get(`/api/playlists/${playlist}`)).body.entries[0];
    expect(entry.track).toMatchObject({ title: 'One', isFavorite: true, playCount: 2 });
    expect((await ctx.authed.delete(`/api/playlists/${playlist}/tracks/${entry.entryId}`)).status).toBe(404);
    expect((await listener.client.get(`/api/playlists/${playlist}`)).body.playlist.name).toBe('Mine');

    // Deleting the account takes its favorites, plays and playlists with it, and nothing else.
    await ctx.authed.delete(`/api/admin/users/${listener.id}`);
    expect((await ctx.db.query('SELECT 1 FROM playlists WHERE id = $1', [playlist])).length).toBe(0);
    expect((await ctx.authed.get('/api/tracks')).body.total).toBe(2);
  });
});

describe('how plays are counted', () => {
  it('treats an early exit as a skip, and each play can be finished once by its owner', async () => {
    const ctx = await createTestApp();
    const ids = await seedTracks(ctx, [{ title: 'Long', artist: 'A', album: 'X' }]);
    await ctx.db.query('UPDATE tracks SET duration = 200 WHERE id = $1', [ids.Long]);
    const listener = await createListener(ctx, 'guest');
    const play = async () => (await listener.client.post(`/api/tracks/${ids.Long}/play`)).body.playId as number;
    const finish = (playId: number, listenedSeconds: number, completed: boolean, client = listener.client) =>
      client.post(`/api/plays/${playId}/finish`).send({ listenedSeconds, completed });

    const skipped = await play();
    expect((await finish(skipped, 8, false)).status).toBe(204);
    expect((await listener.client.get(`/api/tracks/${ids.Long}`)).body.track.playCount).toBe(0);
    expect((await listener.client.get('/api/listening?days=7')).body.listening.plays).toBe(0);
    expect((await finish(skipped, 200, true)).status).toBe(404);

    const heard = await play();
    expect((await finish(heard, 120, false, ctx.authed)).status).toBe(404);
    expect((await finish(heard, 120, false)).status).toBe(204);
    const finished = await play();
    expect((await finish(finished, 10_000, true)).status).toBe(204);

    expect((await listener.client.get(`/api/tracks/${ids.Long}`)).body.track.playCount).toBe(2);
    const { listening } = (await listener.client.get('/api/listening?days=7')).body;
    // Real listening time where reported, capped at the track's length (plus a little slack).
    expect(listening).toMatchObject({ plays: 2, seconds: 120 + 205 });
    const [stats] = await ctx.db.query<{ skip_count: number }>('SELECT skip_count FROM user_track_stats WHERE track_id = $1', [ids.Long]);
    expect(stats.skip_count).toBe(1);

    for (const body of [{ listenedSeconds: -1, completed: false }, { listenedSeconds: 1.5, completed: true }, { listenedSeconds: 3 }, {}]) {
      expect((await listener.client.post(`/api/plays/${finished}/finish`).send(body)).status).toBe(400);
    }
    expect((await listener.client.post('/api/plays/not-a-number/finish').send({ listenedSeconds: 1, completed: true })).status).toBe(404);
  });
});

describe('recommendations', () => {
  it('serve mixes, shelves and radio built from what the account plays', async () => {
    const ctx = await createTestApp();
    const songs = [
      ...['Dawn', 'Drift', 'Dune', 'Delta'].map((title) => ({ title, artist: 'Aurora', album: 'Light', genre: 'Ambient' })),
      ...['Echo', 'Ember', 'Eden'].map((title) => ({ title, artist: 'Haze', album: 'Fog', genre: 'Ambient' })),
      ...['Neon', 'Night', 'Nova', 'Noir'].map((title) => ({ title, artist: 'Owls', album: 'After Hours', genre: 'Synthwave' })),
      ...['Grid', 'Glow'].map((title) => ({ title, artist: 'Pulse', album: 'Lines', genre: 'Synthwave' })),
    ];
    const ids = await seedTracks(ctx, songs);
    const listener = await createListener(ctx, 'guest');

    const fresh = (await listener.client.get('/api/recommendations')).body;
    expect(fresh.coldStart).toBe(true);

    for (const title of ['Dawn', 'Drift', 'Dune', 'Echo', 'Neon', 'Night', 'Nova', 'Dawn', 'Neon']) {
      const { playId } = (await listener.client.post(`/api/tracks/${ids[title]}/play`)).body;
      await listener.client.post(`/api/plays/${playId}/finish`).send({ listenedSeconds: 3, completed: true });
    }
    await listener.client.patch(`/api/tracks/${ids.Delta}`).send({ isFavorite: true });

    const home = (await listener.client.get('/api/recommendations')).body;
    expect(home.coldStart).toBe(false);
    expect(home.mixes.length).toBeGreaterThan(0);
    for (const mix of home.mixes) {
      expect(mix).toMatchObject({ id: expect.any(String), title: expect.any(String), trackCount: expect.any(Number), covers: expect.any(Array) });
      const detail = await listener.client.get(`/api/recommendations/mixes/${mix.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.tracks).toHaveLength(mix.trackCount);
      expect(detail.body.tracks[0]).toHaveProperty('streamUrl');
    }
    const daily = home.mixes.filter((mix: { kind: string }) => mix.kind === 'daily');
    expect(daily.length).toBeGreaterThan(0);

    const station = await listener.client.get(`/api/recommendations/radio?track=${ids.Neon}`);
    expect(station.status).toBe(200);
    expect(station.body.title).toBe('Neon radio');
    expect(station.body.tracks[0].id).toBe(ids.Neon);
    // The same artist's tracks it was played with come early, and no two neighbours share an artist.
    const titles = station.body.tracks.map((track: { title: string }) => track.title);
    expect(titles.slice(1, 5)).toEqual(expect.arrayContaining(['Night', 'Nova']));
    const artists = station.body.tracks.map((track: { artist: string }) => track.artist);
    expect(artists.slice(0, 4).every((artist: string, i: number) => i === 0 || artist !== artists[i - 1])).toBe(true);
    const artistStation = await listener.client.get('/api/recommendations/radio?artist=owls');
    expect(artistStation.body.title).toBe('Owls radio');

    expect((await listener.client.get('/api/recommendations/mixes/nope')).status).toBe(404);
    expect((await listener.client.get('/api/recommendations/radio')).status).toBe(400);
    expect((await listener.client.get(`/api/recommendations/radio?track=${ids.Neon}&artist=Owls`)).status).toBe(400);
    expect((await listener.client.get('/api/recommendations/radio?track=00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await listener.client.get('/api/recommendations/radio?artist=Nobody%20Here')).status).toBe(404);
  });
});

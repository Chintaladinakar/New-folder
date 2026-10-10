import type { APIResponse } from '@playwright/test';
import { API, apiToken, control, expect, makeWav, resetBackend, seedLibrary, seedTrack, test } from './helpers';

// These talk to the API directly, with no browser: hostile and malformed input must be refused with
// a 4xx and a readable message, never crash the request (5xx) or leak internals.

test.describe('hostile input', () => {
  let token: string;
  let headers: { Authorization: string };
  let trackId: string;

  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
    token = await apiToken(request);
    headers = { Authorization: `Bearer ${token}` };
    trackId = (await seedTrack(request, token, { title: 'Target', artist: 'A', album: 'B', seconds: 1 })).id;
  });

  const NASTY = ['\u0000', 'a\u0000b', "'; DROP TABLE tracks; --", '" OR ""="', '%', '_', '\\', '😀'.repeat(300), 'x'.repeat(5000), '\uD800', '../../etc/passwd', '${7*7}', '{{7*7}}', '<script>alert(1)</script>', '\n\r\n'];

  const noServerError = async (label: string, call: () => Promise<APIResponse>) => {
    const response = await call();
    const body = await response.text();
    expect(response.status(), `${label} → ${response.status()}: ${body.slice(0, 200)}`).toBeLessThan(500);
    expect(body, `${label} leaked internals`).not.toMatch(/\bat \S+\.(ts|js):\d+|node_modules|SELECT |INSERT |pg_|ECONN|stack/i);
    return response;
  };

  test('every list filter survives every nasty string', async ({ request }) => {
    for (const param of ['q', 'artist', 'album', 'albumArtist', 'genre', 'format']) {
      for (const value of NASTY) {
        await noServerError(`GET ?${param}=${JSON.stringify(value).slice(0, 25)}`, () =>
          request.get(`${API}/tracks?${new URLSearchParams({ [param]: value })}`, { headers }),
        );
      }
    }
  });

  test('paging and numeric parameters at their edges', async ({ request }) => {
    const cases = ['limit=0', 'limit=-1', 'limit=501', 'limit=abc', 'limit=1.5', 'limit=1e9', 'offset=-1', 'offset=abc', 'offset=1e20', 'offset=99999999999999999999', 'offset=9007199254740993', 'yearFrom=0', 'yearFrom=-1', 'yearFrom=10000', 'yearFrom=1.5', 'yearFrom=abc', 'yearTo=99999999999', 'yearFrom=2000&yearTo=1900', 'favorite=maybe', 'played=2', 'hasLyrics=', 'sort=; DROP', 'sort=title&sort=artist', 'reverse=yes', 'limit=10&limit=20'];
    for (const query of cases) await noServerError(`GET ?${query}`, () => request.get(`${API}/tracks?${query}`, { headers }));
  });

  test('the same filter given twice, or as an array, is not a crash', async ({ request }) => {
    for (const query of ['q=a&q=b', 'q[]=a', 'q[a]=b', 'artist[$ne]=x', '__proto__=1', 'constructor[prototype][x]=1', 'genre=a%00']) {
      await noServerError(`GET ?${query}`, () => request.get(`${API}/tracks?${query}`, { headers }));
    }
  });

  test('ids in the path: malformed, huge, encoded', async ({ request }) => {
    for (const id of ['%00', 'x'.repeat(5000), '..%2F..%2Fetc', '%ZZ', '%E0%A4%A', '00000000-0000-0000-0000-000000000000', trackId.toUpperCase(), `${trackId}%20`, '1; DROP TABLE tracks']) {
      for (const [method, suffix] of [['GET', ''], ['GET', '/stream-url'], ['GET', '/lyrics'], ['PATCH', ''], ['DELETE', ''], ['POST', '/play']] as const) {
        if (method === 'DELETE' && id === trackId.toUpperCase()) continue; // would delete the real one
        await noServerError(`${method} /tracks/${id.slice(0, 20)}${suffix}`, () => request.fetch(`${API}/tracks/${id}${suffix}`, { method, headers, data: method === 'PATCH' ? {} : undefined }));
      }
    }
    const survived = await request.get(`${API}/tracks/${trackId}`, { headers });
    expect(survived.status(), 'the real track must still exist').toBe(200);
  });

  test('editing a track: every field at its limits', async ({ request }) => {
    const bodies: Record<string, unknown>[] = [
      {}, { title: '' }, { title: '   ' }, { title: 'x'.repeat(501) }, { title: 'x'.repeat(500) }, { title: null }, { title: 5 }, { title: ['a'] },
      { title: 'a\u0000b' }, { artist: 'a\u0000b' }, { album: '\u0000' }, { genre: 'g\u0000' }, { albumArtist: '\u0000' },
      { year: 0 }, { year: 1 }, { year: 9999 }, { year: 10000 }, { year: -1 }, { year: 1.5 }, { year: '1990' }, { year: null }, { year: Number.MAX_SAFE_INTEGER },
      { trackNumber: 0 }, { trackNumber: 99999 }, { trackNumber: 100000 }, { discNumber: 999 }, { discNumber: 1000 },
      { isFavorite: 'yes' }, { isFavorite: 1 }, { isFavorite: null }, { isFavorite: true },
      { storageKey: 'x' }, { id: 'x' }, { playCount: 999 }, { contentHash: 'x' }, { __proto__: { x: 1 } }, { 'a.b': 1 },
    ];
    for (const body of bodies) await noServerError(`PATCH ${JSON.stringify(body).slice(0, 60)}`, () => request.patch(`${API}/tracks/${trackId}`, { headers, data: body }));
    const after = await (await request.get(`${API}/tracks/${trackId}`, { headers })).json();
    expect(after.track.playCount, 'a client cannot set its own play count').toBe(0);
  });

  test('upload requests: names, sizes and keys', async ({ request }) => {
    const names = ['', ' ', 'a', 'a.wav', '../../x.wav', 'a\u0000.wav', 'x'.repeat(255) + '.wav', 'x'.repeat(251) + '.wav', '.wav', 'wav', 'a.WAV', 'a.wav ', 'a.wav.exe', '日本.wav', 'con.wav', 'a/b.wav', 'a\\b.wav', '😀.flac'];
    for (const fileName of names) {
      for (const fileSize of [1, 0, -1, 1.5, 5 * 1024 * 1024, 5 * 1024 * 1024 + 1, Number.MAX_SAFE_INTEGER, 'abc', null]) {
        await noServerError(`upload-url ${JSON.stringify(fileName).slice(0, 20)} ${fileSize}`, () => request.post(`${API}/tracks/upload-url`, { headers, data: { fileName, fileSize } }));
      }
    }
    for (const contentHash of ['', 'abc', 'A'.repeat(64), 'a'.repeat(64), 'a'.repeat(65), null, 5]) {
      await noServerError(`upload-url hash ${JSON.stringify(contentHash)}`, () => request.post(`${API}/tracks/upload-url`, { headers, data: { fileName: 'a.wav', fileSize: 10, contentHash } }));
    }
  });

  test('completing an upload cannot be pointed at things it should not touch', async ({ request }) => {
    const keys = ['', 'tracks/', 'tracks/../../secret.wav', '../tracks/00000000-0000-4000-8000-000000000000.wav', 'artwork/anything.png', `tracks/${'0'.repeat(36)}.wav`, 'tracks/00000000-0000-4000-8000-000000000000.exe', 'tracks/00000000-0000-4000-8000-000000000000.wav\u0000', 'tracks/00000000-0000-4000-8000-000000000000.wav/../x.wav', 'TRACKS/00000000-0000-4000-8000-000000000000.wav', 'tracks/00000000-0000-4000-8000-000000000000.wav '];
    for (const storageKey of keys) {
      const response = await noServerError(`complete-upload ${JSON.stringify(storageKey).slice(0, 40)}`, () => request.post(`${API}/tracks/complete-upload`, { headers, data: { fileName: 'a.wav', storageKey } }));
      expect(response.status(), `must not create a track for ${JSON.stringify(storageKey)}`).not.toBe(201);
    }
    // The file name is stored and shown, so it gets the same care as any text.
    for (const fileName of ['a\u0000.wav', 'x'.repeat(256), '']) {
      await noServerError(`complete-upload name ${JSON.stringify(fileName).slice(0, 20)}`, () => request.post(`${API}/tracks/complete-upload`, { headers, data: { fileName, storageKey: 'tracks/00000000-0000-4000-8000-000000000000.wav' } }));
    }
  });

  test('a lyrics body can hold anything text, and nothing else', async ({ request }) => {
    for (const body of [{ lyrics: 'a\u0000b' }, { lyrics: 'x'.repeat(50_000) }, { lyrics: 'x'.repeat(50_001) }, { lyrics: { a: 1 } }, { lyrics: 5 }, { lyrics: ['x'] }, { syncedLyrics: '\u0000' }, { lyrics: null }, {}, { lyrics: '[00:01.00]ok', syncedLyrics: '[99:99.99]odd' }]) {
      await noServerError(`PUT lyrics ${JSON.stringify(body).slice(0, 40)}`, () => request.put(`${API}/tracks/${trackId}/lyrics`, { headers, data: body }));
    }
  });

  test('playlist and login text fields reject NUL bytes with a 4xx', async ({ request }) => {
    await noServerError('playlist name', () => request.post(`${API}/playlists`, { headers, data: { name: 'a\u0000b' } }));
    await noServerError('playlist description', () => request.post(`${API}/playlists`, { headers, data: { name: 'ok', description: 'a\u0000b' } }));
    await noServerError('login', () => request.post(`${API}/auth/login`, { data: { password: 'a\u0000b' } }));
  });

  test('request bodies: wrong type, malformed, empty, oversized', async ({ request }) => {
    const send = (data: string | Buffer, contentType?: string) =>
      request.fetch(`${API}/playlists`, { method: 'POST', headers: { ...headers, ...(contentType ? { 'Content-Type': contentType } : {}) }, data });
    for (const [label, data, type] of [
      ['not json', 'not json', 'application/json'],
      ['truncated json', '{"name":', 'application/json'],
      ['empty', '', 'application/json'],
      ['json null', 'null', 'application/json'],
      ['json array', '[1,2]', 'application/json'],
      ['json string', '"x"', 'application/json'],
      ['text/plain', '{"name":"x"}', 'text/plain'],
      ['form data', 'name=x', 'application/x-www-form-urlencoded'],
      ['no content type', '{"name":"x"}', undefined],
      ['deep nesting', `${'['.repeat(5000)}${']'.repeat(5000)}`, 'application/json'],
      ['bad charset', '{"name":"x"}', 'application/json; charset=utf-7'],
    ] as [string, string, string | undefined][]) {
      await noServerError(`body: ${label}`, () => send(data, type));
    }
    const huge = await send(JSON.stringify({ name: 'x', description: 'y'.repeat(200_000) }), 'application/json');
    expect(huge.status(), 'oversized bodies are refused').toBe(413);
  });

  test('unknown routes and methods are clean 404/405s', async ({ request }) => {
    for (const [method, path] of [['GET', '/nope'], ['POST', '/tracks'], ['PUT', '/tracks'], ['DELETE', '/tracks'], ['PATCH', '/playlists'], ['GET', '//tracks'], ['TRACE', '/tracks']] as const) {
      const response = await noServerError(`${method} ${path}`, () => request.fetch(`${API}${path}`, { method, headers }));
      expect([400, 401, 404, 405], `${method} ${path} → ${response.status()}`).toContain(response.status());
    }
  });
});

test.describe('who can do what', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

  test('every route except health and sign-in refuses a stranger', async ({ request }) => {
    const id = '00000000-0000-4000-8000-000000000000';
    const routes: [string, string][] = [
      ['GET', '/tracks'], ['GET', `/tracks/${id}`], ['PATCH', `/tracks/${id}`], ['DELETE', `/tracks/${id}`], ['GET', `/tracks/${id}/stream-url`], ['GET', `/tracks/${id}/lyrics`], ['PUT', `/tracks/${id}/lyrics`], ['POST', `/tracks/${id}/play`],
      ['POST', '/tracks/upload-url'], ['POST', '/tracks/complete-upload'], ['GET', '/albums'], ['GET', '/artists'], ['GET', '/stats'], ['GET', '/facets'], ['GET', '/listening'],
      ['GET', '/playlists'], ['POST', '/playlists'], ['GET', `/playlists/${id}`], ['PATCH', `/playlists/${id}`], ['DELETE', `/playlists/${id}`], ['POST', `/playlists/${id}/tracks`], ['DELETE', `/playlists/${id}/tracks/${id}`], ['PUT', `/playlists/${id}/order`],
      ['GET', '/storage/b2/health'], ['GET', '/auth/session'],
    ];
    for (const [method, path] of routes) {
      const response = await request.fetch(`${API}${path}`, { method, data: method === 'GET' ? undefined : {} });
      expect(response.status(), `${method} ${path} without a session`).toBe(401);
    }
    for (const path of ['/health']) expect((await request.get(`${API}${path}`)).status()).toBe(200);
  });

  test('tampered, malformed and odd credentials are all refused', async ({ request }) => {
    const token = await apiToken(request);
    const [payload, signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'owner', exp: 9_999_999_999 })).toString('base64url');
    const noneAlg = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${forgedPayload}.`;
    const flip = (value: string) => value.slice(0, -1) + (value.endsWith('A') ? 'B' : 'A');
    const attempts: [string, string][] = [
      ['no scheme', token], ['wrong scheme', `Basic ${token}`], ['lower-case scheme', `bearer ${token}`], ['empty token', 'Bearer '], ['no space', `Bearer${token}`],
      ['payload changed', `Bearer ${forgedPayload}.${signature}`], ['signature changed', `Bearer ${payload}.${flip(signature)}`], ['signature dropped', `Bearer ${payload}.`], ['payload only', `Bearer ${payload}`],
      ['alg none', `Bearer ${noneAlg}`], ['three parts', `Bearer ${token}.x`], ['huge', `Bearer ${'a'.repeat(100_000)}`], ['unicode', 'Bearer 🎵.🎵'], ['null byte', 'Bearer a\u0000b'],
    ];
    for (const [label, authorization] of attempts) {
      const response = await request.get(`${API}/tracks`, { headers: { Authorization: authorization }, failOnStatusCode: false }).catch(() => null);
      // A header the HTTP stack itself rejects is also a refusal.
      // 431 is the HTTP server refusing an oversized header before the app even sees it: also a refusal.
      if (response) expect([401, 431], `${label} must be refused, got ${response.status()}`).toContain(response.status());
    }
    expect((await request.get(`${API}/tracks`, { headers: { Authorization: `Bearer ${token}` } })).status(), 'the real token still works').toBe(200);
  });

  test('a token sent in the query string is not accepted', async ({ request }) => {
    const token = await apiToken(request);
    expect((await request.get(`${API}/tracks?token=${token}&access_token=${token}`)).status()).toBe(401);
  });

  test('the login limiter blocks guessing but a good password still works for others after it resets', async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 14; i += 1) statuses.push((await request.post(`${API}/auth/login`, { data: { password: `guess-${i}` } })).status());
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(10).every((status) => status === 429), `after 10 tries: ${statuses}`).toBe(true);
    const limited = await request.post(`${API}/auth/login`, { data: { password: 'e2e-password' } });
    expect(limited.status(), 'even the right password waits').toBe(429);
    expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0);
  });
});

test.describe('many things at once', () => {
  let token: string;
  let headers: { Authorization: string };

  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
    token = await apiToken(request);
    headers = { Authorization: `Bearer ${token}` };
  });

  test('50 simultaneous plays are all counted', async ({ request }) => {
    const track = await seedTrack(request, token, { title: 'Popular' });
    const results = await Promise.all(Array.from({ length: 50 }, () => request.post(`${API}/tracks/${track.id}/play`, { headers })));
    expect([...new Set(results.map((r) => r.status()))], 'every play is recorded').toEqual([201]);
    const playIds = new Set(await Promise.all(results.map(async (r) => (await r.json()).playId)));
    expect(playIds.size, 'every play has an id of its own').toBe(50);
    const after = await (await request.get(`${API}/tracks/${track.id}`, { headers })).json();
    expect(after.track.playCount).toBe(50);
    const listening = await (await request.get(`${API}/listening?days=1`, { headers })).json();
    expect(listening.listening.plays).toBe(50);
  });

  test('the same upload completed 10 times at once makes exactly one track', async ({ request }) => {
    const body = makeWav({ title: 'Once Only' });
    const { uploadUrl, storageKey, mimeType } = await (await request.post(`${API}/tracks/upload-url`, { headers, data: { fileName: 'once.wav', fileSize: body.length } })).json();
    await request.put(uploadUrl, { headers: { 'Content-Type': mimeType }, data: body });
    const results = await Promise.all(Array.from({ length: 10 }, () => request.post(`${API}/tracks/complete-upload`, { headers, data: { fileName: 'once.wav', storageKey } })));
    for (const result of results) expect(result.status(), await result.text()).toBeLessThan(300);
    const list = await (await request.get(`${API}/tracks`, { headers })).json();
    expect(list.total).toBe(1);
    const ids = new Set((await Promise.all(results.map((r) => r.json()))).map((r) => r.track.id));
    expect(ids.size, 'every caller is told about the same track').toBe(1);
  });

  test('identical audio uploaded under 8 names at once is stored once', async ({ request }) => {
    const body = makeWav({ title: 'Clone', seconds: 2 });
    const { createHash } = await import('node:crypto');
    const contentHash = createHash('sha256').update(body).digest('hex');
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        const target = await request.post(`${API}/tracks/upload-url`, { headers, data: { fileName: `clone-${i}.wav`, fileSize: body.length, contentHash } });
        if (target.status() === 409) return 409;
        const { uploadUrl, storageKey, mimeType } = await target.json();
        await request.put(uploadUrl, { headers: { 'Content-Type': mimeType }, data: body });
        return (await request.post(`${API}/tracks/complete-upload`, { headers, data: { fileName: `clone-${i}.wav`, storageKey, contentHash } })).status();
      }),
    );
    expect(outcomes.every((status) => [200, 201, 409].includes(status)), `statuses: ${outcomes}`).toBe(true);
    const list = await (await request.get(`${API}/tracks`, { headers })).json();
    expect(list.total, 'duplicate audio must not be stored twice').toBe(1);
    const state = await (await control(request, 'state')).json();
    expect(state.objects.filter((key: string) => key.startsWith('tracks/')).length, 'rejected copies are removed from storage').toBe(1);
  });

  test('parallel additions to one playlist get distinct, gap-free positions', async ({ request }) => {
    const tracks = [];
    for (let i = 0; i < 6; i += 1) tracks.push(await seedTrack(request, token, { title: `T${i}`, seconds: 0.5 }));
    const { playlist } = await (await request.post(`${API}/playlists`, { headers, data: { name: 'Race' } })).json();
    await Promise.all(tracks.flatMap((track) => [request.post(`${API}/playlists/${playlist.id}/tracks`, { headers, data: { trackIds: [track.id] } }), request.post(`${API}/playlists/${playlist.id}/tracks`, { headers, data: { trackIds: [track.id] } })]));
    const detail = await (await request.get(`${API}/playlists/${playlist.id}`, { headers })).json();
    expect(detail.entries).toHaveLength(12);
    expect(detail.entries.map((entry: { position: number }) => entry.position)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  test('two reorders at once leave a valid order', async ({ request }) => {
    const tracks = [];
    for (let i = 0; i < 4; i += 1) tracks.push(await seedTrack(request, token, { title: `R${i}`, seconds: 0.5 }));
    const { playlist } = await (await request.post(`${API}/playlists`, { headers, data: { name: 'Shuffle race' } })).json();
    await request.post(`${API}/playlists/${playlist.id}/tracks`, { headers, data: { trackIds: tracks.map((t) => t.id) } });
    const ids = (await (await request.get(`${API}/playlists/${playlist.id}`, { headers })).json()).entries.map((e: { entryId: string }) => e.entryId) as string[];
    const results = await Promise.all([
      request.put(`${API}/playlists/${playlist.id}/order`, { headers, data: { entryIds: [...ids].reverse() } }),
      request.put(`${API}/playlists/${playlist.id}/order`, { headers, data: { entryIds: [ids[1], ids[0], ids[3], ids[2]] } }),
    ]);
    expect(results.every((r) => [204, 409].includes(r.status()))).toBe(true);
    const detail = await (await request.get(`${API}/playlists/${playlist.id}`, { headers })).json();
    expect(detail.entries.map((e: { position: number }) => e.position)).toEqual([1, 2, 3, 4]);
    expect(new Set(detail.entries.map((e: { entryId: string }) => e.entryId)).size).toBe(4);
  });

  test('deleting a track while it is being played, favourited and added to a playlist does not corrupt anything', async ({ request }) => {
    const track = await seedTrack(request, token, { title: 'Doomed' });
    const { playlist } = await (await request.post(`${API}/playlists`, { headers, data: { name: 'P' } })).json();
    const results = await Promise.all([
      request.delete(`${API}/tracks/${track.id}`, { headers }),
      request.post(`${API}/tracks/${track.id}/play`, { headers }),
      request.patch(`${API}/tracks/${track.id}`, { headers, data: { isFavorite: true } }),
      request.post(`${API}/playlists/${playlist.id}/tracks`, { headers, data: { trackIds: [track.id] } }),
      request.get(`${API}/tracks/${track.id}/stream-url`, { headers }),
    ]);
    for (const result of results) expect(result.status(), `${result.url()} → ${result.status()}`).toBeLessThan(500);
    expect((await request.get(`${API}/tracks/${track.id}`, { headers })).status()).toBe(404);
    const detail = await (await request.get(`${API}/playlists/${playlist.id}`, { headers })).json();
    expect(detail.entries, 'no entry may point at a deleted track').toEqual([]);
  });

  test('a burst of 300 reads is answered without a single server error', async ({ request }) => {
    await seedLibrary(request, token);
    const results = await Promise.all(Array.from({ length: 300 }, (_, i) => request.get(`${API}/${['tracks', 'albums', 'artists', 'stats', 'facets', 'playlists'][i % 6]}`, { headers })));
    const codes = results.map((r) => r.status());
    expect(codes.filter((code) => code >= 500), 'server errors under load').toEqual([]);
  });

  test('deleting removes both the audio and its cover art, and leaves shared art alone', async ({ request }) => {
    const art = await seedTrack(request, token, { title: 'With Art', seconds: 1 });
    const list = await (await control(request, 'state')).json();
    expect(list.objects.some((key: string) => key.startsWith('tracks/'))).toBe(true);
    await request.delete(`${API}/tracks/${art.id}`, { headers });
    const after = await (await control(request, 'state')).json();
    expect(after.objects.filter((key: string) => key.startsWith('tracks/'))).toEqual([]);
  });
});

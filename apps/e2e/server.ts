// Test backend for the browser tests: the real API, an in-memory Postgres (PGlite), and a fake B2
// whose "presigned" URLs point at a small HTTP server below. Touches no real service.
//
//   API      http://localhost:4010/api
//   storage  http://localhost:4011/__storage/<key>   (PUT = upload, GET = playback, supports Range)
//   control  http://localhost:4011/__test/*          (reset, inject failures, set lyrics)
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

// Keep the developer's real .env (database, B2 keys) out of this process.
process.env.VITEST = '1';

const { PGlite } = await import('@electric-sql/pglite');
const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
const { createApp } = await import('../api/src/app.js');
const { buildDeps } = await import('../api/src/deps.js');
const { runMigrations } = await import('../api/src/db/migrate.js');
const { AuthService } = await import('../api/src/services/authService.js');
const { FakeStorage } = await import('../api/test/helpers.js');
type Db = import('../api/src/db/index.js').Db;

const API_PORT = 4010;
const STORAGE_PORT = 4011;
export const PASSWORD = 'e2e-password';
const SECRET = 'e2e-secret-that-is-comfortably-longer-than-32-chars';

const control = {
  /** The next N uploads are answered with HTTP 500. */
  failPuts: 0,
  /** Uploads wait this long before answering, so progress and cancel can be observed. */
  putDelayMs: 0,
  /** Bumped to invalidate every signed URL handed out so far. */
  urlEpoch: 1,
  /** What the fake lyrics service answers with; null means "no match". */
  lyrics: null as null | { plainLyrics?: string | null; syncedLyrics?: string | null },
  lyricsStatus: 200,
  lyricsCalls: 0,
  uploadMaxSizeBytes: 5 * 1024 * 1024,
};

class E2EStorage extends FakeStorage {
  async getUploadUrl(key: string, contentType: string): Promise<string> {
    return `http://localhost:${STORAGE_PORT}/__storage/${key}?type=${encodeURIComponent(contentType)}`;
  }
  async getSignedUrl(key: string) {
    return { url: `http://localhost:${STORAGE_PORT}/__storage/${key}?epoch=${control.urlEpoch}`, expiresAt: new Date(Date.now() + 3600_000) };
  }
}

function wrap(connection: InstanceType<typeof PGlite> | import('@electric-sql/pglite').Transaction): Db {
  const db: Db = {
    async query<T>(text: string, params: unknown[] = []) {
      return (await connection.query<T>(text, params)).rows;
    },
    async exec(sql: string) {
      await connection.exec(sql);
    },
    transaction: (fn) => (connection instanceof PGlite ? connection.transaction((tx) => fn(wrap(tx))) : fn(db)),
  };
  return db;
}

let storage = new E2EStorage();
let currentApp: ReturnType<typeof createApp>;

async function reset() {
  const pg = await PGlite.create({ extensions: { pgcrypto }, parsers: { 20: (value: string) => Number(value) } });
  const db = wrap(pg);
  await runMigrations(db);
  storage = new E2EStorage();
  Object.assign(control, { failPuts: 0, putDelayMs: 0, urlEpoch: control.urlEpoch + 1, lyrics: null, lyricsStatus: 200, lyricsCalls: 0 });

  const lyricsFetch = (async () => {
    control.lyricsCalls += 1;
    if (control.lyricsStatus !== 200) return new Response(null, { status: control.lyricsStatus });
    return control.lyrics ? Response.json(control.lyrics) : new Response(null, { status: 404 });
  }) as typeof fetch;

  const auth = new AuthService({ password: PASSWORD, secret: SECRET, tokenTtlDays: 1 });
  currentApp = createApp(buildDeps(db, storage, auth, control.uploadMaxSizeBytes, lyricsFetch), { corsOrigins: [], trustProxy: 0 });
}
await reset();

// --- API server ---------------------------------------------------------------------------
createServer((req, res) => currentApp(req, res)).listen(API_PORT, () => console.log(`e2e API on :${API_PORT}`));

// --- Storage + control server ----------------------------------------------------------------
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
};

const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${STORAGE_PORT}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    if (url.pathname.startsWith('/__test/')) {
      const name = url.pathname.slice('/__test/'.length);
      const body = req.method === 'POST' ? (JSON.parse((await readBody(req)).toString() || '{}') as Record<string, unknown>) : {};
      if (name === 'reset') await reset();
      else if (name === 'fail-puts') control.failPuts = Number(body.count ?? 1);
      else if (name === 'put-delay') control.putDelayMs = Number(body.ms ?? 0);
      else if (name === 'expire-urls') control.urlEpoch += 1;
      else if (name === 'lyrics') {
        control.lyrics = (body.lyrics as typeof control.lyrics) ?? null;
        control.lyricsStatus = Number(body.status ?? 200);
      } else if (name === 'state') return json(res, 200, { ...control, objects: [...storage.objects.keys()] });
      else return json(res, 404, { message: 'unknown control' });
      return json(res, 200, { ok: true, state: { ...control, objects: [...storage.objects.keys()] } });
    }

    if (!url.pathname.startsWith('/__storage/')) return json(res, 404, { message: 'not found' });
    const key = decodeURIComponent(url.pathname.slice('/__storage/'.length));

    if (req.method === 'PUT') {
      const body = await readBody(req);
      if (control.putDelayMs) await new Promise((resolve) => setTimeout(resolve, control.putDelayMs));
      if (control.failPuts > 0) {
        control.failPuts -= 1;
        res.writeHead(500, cors);
        res.end('injected failure');
        return;
      }
      storage.put(key, body, url.searchParams.get('type') ?? req.headers['content-type'] ?? 'application/octet-stream');
      res.writeHead(200, cors);
      res.end();
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const object = storage.objects.get(key);
      if (!object) return json(res, 404, { message: 'no such key' });
      // A link signed before the last "expire" is refused, like an expired B2 signature.
      if (Number(url.searchParams.get('epoch') ?? control.urlEpoch) !== control.urlEpoch) return json(res, 403, { message: 'expired' });

      const total = object.body.length;
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      let [start, end] = [0, total - 1];
      if (range) {
        start = range[1] === '' ? Math.max(0, total - Number(range[2])) : Number(range[1]);
        end = range[1] === '' || range[2] === '' ? total - 1 : Math.min(Number(range[2]), total - 1);
        if (start > end || start >= total) {
          res.writeHead(416, { ...cors, 'Content-Range': `bytes */${total}` });
          res.end();
          return;
        }
      }
      res.writeHead(range ? 206 : 200, {
        ...cors,
        'Content-Type': object.contentType,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${total}` } : {}),
      });
      res.end(req.method === 'HEAD' ? undefined : object.body.subarray(start, end + 1));
      return;
    }

    res.writeHead(405, cors);
    res.end();
  } catch (error) {
    console.error('storage server error:', error);
    json(res, 500, { message: (error as Error).message });
  }
}).listen(STORAGE_PORT, () => console.log(`e2e storage on :${STORAGE_PORT}`));

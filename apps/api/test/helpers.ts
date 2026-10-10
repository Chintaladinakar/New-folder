import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { Readable } from 'stream';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { Db } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrate.js';
import { buildDeps, type AppDeps } from '../src/deps.js';
import { AuthService } from '../src/services/authService.js';
import type { ListedObject, MusicStorage, SignedUrl, StoredObject } from '../src/storage/base.js';

export const TEST_PASSWORD = 'correct horse battery staple';
export const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';

function wrap(connection: PGlite | Transaction): Db {
  const db: Db = {
    async query<T>(text: string, params: unknown[] = []) {
      return (await connection.query<T>(text, params)).rows;
    },
    async exec(sql: string) {
      await connection.exec(sql);
    },
    transaction: (fn) =>
      connection instanceof PGlite ? connection.transaction((tx) => fn(wrap(tx))) : fn(db),
  };
  return db;
}

/** A real Postgres (PGlite, in-process) with every migration applied. */
export async function createTestDb(options: { migrate?: boolean } = {}): Promise<{ db: Db; pglite: PGlite }> {
  const pglite = await PGlite.create({ extensions: { pgcrypto }, parsers: { 20: (value) => Number(value) } });
  const db = wrap(pglite);
  if (options.migrate !== false) await runMigrations(db);
  return { db, pglite };
}

/** In-memory stand-in for B2. `put` plays the part of the browser's presigned PUT. */
export class FakeStorage implements MusicStorage {
  readonly bucket = 'test-bucket';
  readonly region = 'test-region';
  readonly objects = new Map<string, { body: Buffer; contentType: string; lastModified: Date }>();

  put(key: string, body: Uint8Array, contentType = 'audio/wav', lastModified = new Date()) {
    this.objects.set(key, { body: Buffer.from(body), contentType, lastModified });
  }

  async upload(body: Uint8Array, key: string, contentType: string): Promise<void> {
    this.put(key, body, contentType);
  }

  async getUploadUrl(key: string, contentType: string): Promise<string> {
    return `https://storage.test/upload/${key}?type=${encodeURIComponent(contentType)}`;
  }

  async head(key: string): Promise<StoredObject | null> {
    const object = this.objects.get(key);
    return object ? { size: object.body.length, contentType: object.contentType } : null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async getSignedUrl(key: string): Promise<SignedUrl> {
    return { url: `https://storage.test/${key}?signature=test`, expiresAt: new Date(Date.now() + 3600_000) };
  }

  async getObject(key: string): Promise<Readable> {
    const object = this.objects.get(key);
    if (!object) throw Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey' });
    return Readable.from([object.body], { objectMode: false });
  }

  async *list(prefix: string): AsyncIterable<ListedObject> {
    for (const [key, object] of this.objects) {
      if (key.startsWith(prefix)) yield { key, size: object.body.length, lastModified: object.lastModified };
    }
  }

  async testConnection(): Promise<void> {}
}

export async function createTestApp(
  options: { storage?: FakeStorage | null; auth?: AuthService; uploadMaxSizeBytes?: number; lyricsFetch?: typeof fetch } = {},
) {
  const { db, pglite } = await createTestDb();
  const storage = options.storage === undefined ? new FakeStorage() : options.storage;
  const auth = options.auth ?? new AuthService({ password: TEST_PASSWORD, secret: TEST_SECRET, tokenTtlDays: 1 });
  // Tests must never reach the real lyrics service.
  const lyricsFetch = options.lyricsFetch ?? (async () => new Response(null, { status: 404 }));
  const deps: AppDeps = buildDeps(db, storage, auth, options.uploadMaxSizeBytes ?? 5 * 1024 * 1024, lyricsFetch);
  const app = createApp(deps, { corsOrigins: [], trustProxy: 0 });
  // `authed` is the admin; `as(token)` makes requests as anyone else (see createListener).
  const admin = await deps.users.getAdmin();
  const token = auth.isConfigured ? auth.issueToken(admin).token : '';
  const as = (bearer: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${bearer}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${bearer}`),
    patch: (url: string) => request(app).patch(url).set('Authorization', `Bearer ${bearer}`),
    put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${bearer}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${bearer}`),
  });
  return { app, db, pglite, storage: storage as FakeStorage, deps, token, authed: as(token), as, admin };
}

/** Creates a listener through the admin API and signs them in with their PIN. */
export async function createListener(ctx: Awaited<ReturnType<typeof createTestApp>>, username: string, pin = '902817') {
  const created = await ctx.authed.post('/api/admin/users').send({ username, displayName: username, pin });
  if (created.status !== 201) throw new Error(`creating ${username}: ${created.status} ${JSON.stringify(created.body)}`);
  const login = await request(ctx.app).post('/api/auth/pin').send({ username, pin });
  if (login.status !== 200) throw new Error(`signing in ${username}: ${login.status} ${JSON.stringify(login.body)}`);
  return { id: created.body.user.id as string, token: login.body.token as string, client: ctx.as(login.body.token) };
}

const chunk = (id: string, body: Buffer) => {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(body.length, 4);
  // RIFF chunks are padded to an even length.
  return Buffer.concat([header, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};

const id3Frame = (id: string, body: Buffer) => {
  const header = Buffer.alloc(10);
  header.write(id, 0, 'ascii');
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
};

/** A tiny ID3v2.3 tag carrying a title and a cover picture. */
function id3Tag(title: string, picture: Buffer): Buffer {
  const frames = Buffer.concat([
    id3Frame('TIT2', Buffer.concat([Buffer.from([0]), Buffer.from(title, 'latin1')])),
    id3Frame(
      'APIC',
      Buffer.concat([Buffer.from([0]), Buffer.from('image/png\0', 'latin1'), Buffer.from([3, 0]), picture]),
    ),
  ]);
  const size = frames.length;
  const syncsafe = Buffer.from([(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]);
  return Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.from([3, 0, 0]), syncsafe, frames]);
}

/** A valid mono 16-bit WAV of silence with optional RIFF INFO tags or an ID3 tag with artwork. */
export function makeWav(
  options: { seconds?: number; title?: string; artist?: string; album?: string; picture?: Buffer } = {},
): Buffer {
  const sampleRate = 8000;
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(1, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(sampleRate * 2, 8);
  fmt.writeUInt16LE(2, 12);
  fmt.writeUInt16LE(16, 14);

  const info: Buffer[] = [];
  const text = (value: string) => Buffer.from(`${value}\0`, 'latin1');
  if (options.title && !options.picture) info.push(chunk('INAM', text(options.title)));
  if (options.artist) info.push(chunk('IART', text(options.artist)));
  if (options.album) info.push(chunk('IPRD', text(options.album)));

  const chunks = [chunk('fmt ', fmt)];
  if (info.length) chunks.push(chunk('LIST', Buffer.concat([Buffer.from('INFO', 'ascii'), ...info])));
  chunks.push(chunk('data', Buffer.alloc(Math.round((options.seconds ?? 1) * sampleRate * 2))));
  if (options.picture) chunks.push(chunk('id3 ', id3Tag(options.title ?? 'Untitled', options.picture)));

  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), ...chunks]);
  return chunk('RIFF', body);
}

/** Smallest valid PNG (1x1 transparent pixel). */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** Runs the presigned upload flow end to end and returns the created track. */
export async function uploadTrack(
  ctx: Awaited<ReturnType<typeof createTestApp>>,
  fileName: string,
  body: Buffer,
  contentHash?: string,
) {
  const urlResponse = await ctx.authed.post('/api/tracks/upload-url').send({ fileName, fileSize: body.length, contentHash });
  if (urlResponse.status !== 200) return urlResponse;
  ctx.storage.put(urlResponse.body.storageKey, body, urlResponse.body.mimeType);
  return ctx.authed.post('/api/tracks/complete-upload').send({ fileName, storageKey: urlResponse.body.storageKey, contentHash });
}

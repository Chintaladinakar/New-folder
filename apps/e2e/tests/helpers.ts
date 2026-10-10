import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';

export const API = 'http://localhost:4010/api';
export const CTRL = 'http://localhost:4011/__test';
export const PASSWORD = 'e2e-password';

// ---------------------------------------------------------------------------------------------
// Audio fixtures
// ---------------------------------------------------------------------------------------------

const chunk = (id: string, body: Buffer) => {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};

export type WavOptions = { seconds?: number; title?: string; artist?: string; album?: string; genre?: string; year?: number; track?: number };

/** A valid mono 16-bit 8 kHz WAV of silence, with RIFF INFO tags. Real audio, so the browser plays it. */
export function makeWav({ seconds = 3, title, artist, album, genre, year, track }: WavOptions = {}): Buffer {
  const sampleRate = 8000;
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(1, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(sampleRate * 2, 8);
  fmt.writeUInt16LE(2, 12);
  fmt.writeUInt16LE(16, 14);

  const text = (value: string) => Buffer.from(`${value}\0`, 'utf8');
  const info: Buffer[] = [];
  if (title) info.push(chunk('INAM', text(title)));
  if (artist) info.push(chunk('IART', text(artist)));
  if (album) info.push(chunk('IPRD', text(album)));
  if (genre) info.push(chunk('IGNR', text(genre)));
  if (year) info.push(chunk('ICRD', text(String(year))));
  if (track) info.push(chunk('ITRK', text(String(track))));

  const parts = [chunk('fmt ', fmt)];
  if (info.length) parts.push(chunk('LIST', Buffer.concat([Buffer.from('INFO', 'ascii'), ...info])));
  parts.push(chunk('data', Buffer.alloc(Math.round(seconds * sampleRate * 2))));
  return chunk('RIFF', Buffer.concat([Buffer.from('WAVE', 'ascii'), ...parts]));
}

export const wavFile = (name: string, options: WavOptions = {}) => ({ name, mimeType: 'audio/wav', buffer: makeWav(options) });

// ---------------------------------------------------------------------------------------------
// Backend control and seeding (talks to the real API, the same way the app does)
// ---------------------------------------------------------------------------------------------

export async function resetBackend(request: APIRequestContext) {
  const response = await request.post(`${CTRL}/reset`, { data: {} });
  expect(response.ok()).toBeTruthy();
}

export const control = (request: APIRequestContext, name: string, data: Record<string, unknown> = {}) =>
  request.post(`${CTRL}/${name}`, { data });

export type SessionUser = { id: string; username: string; displayName: string | null; role: 'admin' | 'listener' };

/** Signs in through the API: the admin with the password, or a listener with their username and PIN. */
export async function apiLogin(request: APIRequestContext, listener?: { username: string; pin: string }): Promise<{ token: string; user: SessionUser }> {
  const response = listener
    ? await request.post(`${API}/auth/pin`, { data: listener })
    : await request.post(`${API}/auth/login`, { data: { password: PASSWORD } });
  expect(response.ok(), `API sign-in${listener ? ` as ${listener.username}` : ''}`).toBeTruthy();
  const { token, user } = await response.json();
  return { token, user };
}

export async function apiToken(request: APIRequestContext): Promise<string> {
  return (await apiLogin(request)).token;
}

/** A listener account, made by the admin through the API. */
export async function createListener(request: APIRequestContext, adminToken: string, username: string, pin = '482913', displayName?: string) {
  const response = await request.post(`${API}/admin/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { username, pin, ...(displayName ? { displayName } : {}) },
  });
  expect(response.ok(), `create ${username}: ${await response.text()}`).toBeTruthy();
  return (await response.json()).user as SessionUser;
}

export type SeedTrack = WavOptions & { fileName?: string; favorite?: boolean; genre?: string; year?: number };

/** Uploads a track through upload-url → PUT → complete-upload, then applies any edits. Returns the track. */
export async function seedTrack(request: APIRequestContext, token: string, options: SeedTrack = {}) {
  const fileName = options.fileName ?? `${(options.title ?? 'track').replace(/[^\w.-]+/g, '_')}-${Math.random().toString(36).slice(2, 7)}.wav`;
  const body = makeWav(options);
  const headers = { Authorization: `Bearer ${token}` };

  const target = await request.post(`${API}/tracks/upload-url`, { headers, data: { fileName, fileSize: body.length } });
  expect(target.ok(), `upload-url for ${fileName}: ${await target.text()}`).toBeTruthy();
  const { uploadUrl, storageKey, mimeType } = await target.json();

  const put = await request.put(uploadUrl, { headers: { 'Content-Type': mimeType }, data: body });
  expect(put.ok(), 'PUT to storage').toBeTruthy();

  const done = await request.post(`${API}/tracks/complete-upload`, { headers, data: { fileName, storageKey } });
  expect(done.ok(), `complete-upload for ${fileName}: ${await done.text()}`).toBeTruthy();
  let { track } = await done.json();

  const patch: Record<string, unknown> = {};
  if (options.genre) patch.genre = options.genre;
  if (options.year) patch.year = options.year;
  if (options.favorite) patch.isFavorite = true;
  if (Object.keys(patch).length) {
    const edited = await request.patch(`${API}/tracks/${track.id}`, { headers, data: patch });
    expect(edited.ok(), 'PATCH track').toBeTruthy();
    track = (await edited.json()).track;
  }
  return track as { id: string; title: string; artist: string | null; album: string | null };
}

/** A small library with several artists, albums, genres and years. */
export async function seedLibrary(request: APIRequestContext, token: string) {
  const rows: SeedTrack[] = [
    { title: 'Morning Light', artist: 'Aurora Vale', album: 'Daybreak', genre: 'Ambient', year: 2019, track: 1, seconds: 4 },
    { title: 'Slow Tide', artist: 'Aurora Vale', album: 'Daybreak', genre: 'Ambient', year: 2019, track: 2, seconds: 5 },
    { title: 'Neon Streets', artist: 'The Night Owls', album: 'After Hours', genre: 'Synthwave', year: 1987, track: 1, seconds: 3 },
    { title: 'Midnight Drive', artist: 'The Night Owls', album: 'After Hours', genre: 'Synthwave', year: 1987, track: 2, seconds: 6 },
    { title: 'Paper Planes', artist: 'Juniper', album: 'Small Things', genre: 'Folk', year: 2008, track: 1, seconds: 3, favorite: true },
    { title: 'No Tags Here', seconds: 2 },
  ];
  const tracks = [];
  for (const row of rows) tracks.push(await seedTrack(request, token, row));
  return tracks;
}

// ---------------------------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------------------------

export const SESSION_KEY = 'mp3-player:session';

/**
 * Puts a valid session in localStorage before the app loads (once per tab, so sign-out still sticks).
 * With the account, as the sign-in screen stores it, the app knows at once what it may show.
 */
export async function signIn(page: Page, token: string, user?: SessionUser) {
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem('__e2e_seeded')) return;
      sessionStorage.setItem('__e2e_seeded', '1');
      localStorage.setItem(key, value);
    },
    [SESSION_KEY, JSON.stringify({ token, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), ...(user ? { user } : {}) })],
  );
}

type Fixtures = {
  /** Console errors and uncaught exceptions are test failures unless a pattern here allows them. */
  allowedErrors: { patterns: RegExp[] };
  /** Declares errors a test provokes on purpose (e.g. a 409 for a duplicate), so everything else still fails it. */
  expectErrors: (...patterns: RegExp[]) => void;
  /** @internal */
  errorBudget: { patterns: RegExp[] };
  /** A page signed in as the admin, on an empty library. */
  app: { page: Page; token: string };
};

export const test = base.extend<Fixtures>({
  allowedErrors: [{ patterns: [] }, { option: true }],

  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructuring pattern, even for no dependencies
  errorBudget: async ({}, use) => {
    await use({ patterns: [] });
  },

  expectErrors: async ({ errorBudget }, use) => {
    await use((...patterns: RegExp[]) => void errorBudget.patterns.push(...patterns));
  },

  page: async ({ page, allowedErrors, errorBudget }, use) => {
    // Record every <audio> the app creates (it isn't in the DOM), so tests can check real playback.
    await page.addInitScript(() => {
      const Original = window.Audio;
      const audios: HTMLAudioElement[] = [];
      (window as unknown as { __audios: HTMLAudioElement[] }).__audios = audios;
      window.Audio = function (this: unknown, ...args: ConstructorParameters<typeof Audio>) {
        const element = new Original(...args);
        audios.push(element);
        return element;
      } as unknown as typeof Audio;
      window.Audio.prototype = Original.prototype;
    });
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
    });
    await use(page);
    const unexpected = problems.filter((problem) => ![...allowedErrors.patterns, ...errorBudget.patterns].some((pattern) => pattern.test(problem)));
    expect(unexpected, 'unexpected browser errors').toEqual([]);
  },

  app: async ({ page, request }, use) => {
    await resetBackend(request);
    const { token, user } = await apiLogin(request);
    await signIn(page, token, user);
    await use({ page, token });
  },
});

export { expect };

/** Opens a path and waits for the app shell. */
export async function open(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.locator('main#main')).toBeVisible();
}

export const isPhone = (projectName: string) => projectName === 'phone';
export const isDesktop = (projectName: string) => projectName === 'desktop';

/** A tab-bar or top-bar link to a main section (only one of the two navs is visible at a time). */
export const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).locator('a:visible', { hasText: new RegExp(`^${name}$`) });

// ---------------------------------------------------------------------------------------------
// Player helpers
// ---------------------------------------------------------------------------------------------

export type AudioState = { paused: boolean; currentTime: number; duration: number; src: string; volume: number; muted: boolean; ended: boolean; errorCode: number | null };

/** What the real <audio> element is doing right now. */
export async function audioState(page: Page): Promise<AudioState | null> {
  return page.evaluate(() => {
    const audio = (window as unknown as { __audios?: HTMLAudioElement[] }).__audios?.[0];
    if (!audio) return null;
    return {
      paused: audio.paused,
      currentTime: audio.currentTime,
      duration: audio.duration,
      src: audio.src,
      volume: audio.volume,
      muted: audio.muted,
      ended: audio.ended,
      errorCode: audio.error?.code ?? null,
    };
  });
}

export const expectPlaying = (page: Page) => expect.poll(async () => (await audioState(page))?.paused, { message: 'audio is playing' }).toBe(false);
export const expectPaused = (page: Page) => expect.poll(async () => (await audioState(page))?.paused, { message: 'audio is paused' }).toBe(true);
export const expectTimeAbove = (page: Page, seconds: number) =>
  expect.poll(async () => (await audioState(page))?.currentTime ?? 0, { message: `playback passes ${seconds}s` }).toBeGreaterThan(seconds);

/** Every track row on the current page (the song tabs and shelves are not rows). */
export const trackRows = (page: Page) => page.locator('main#main ul.stagger > li');

/** A row in the song list on the current page. */
export const row = (page: Page, title: string | RegExp) => page.locator('main#main li').filter({ hasText: title }).first();

/** Starts a track by clicking its row. */
export async function playRow(page: Page, title: string | RegExp) {
  await row(page, title).click();
  await expectPlaying(page);
}

export const viewportWidth = (page: Page) => page.viewportSize()?.width ?? 0;
export const isPhoneWidth = (page: Page) => viewportWidth(page) < 768;

/**
 * Phones only have play/pause on the small player card; the rest of the controls live on the full
 * player page. This opens it there, and does nothing on larger screens, where controls are always visible.
 */
/** The cover grows into the full player in a view transition, which takes no input while it plays. */
export async function waitForViewTransition(page: Page) {
  await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'));
}

export async function showFullControls(page: Page) {
  if (isPhoneWidth(page) && !page.url().includes('/now-playing')) {
    await page.getByRole('region', { name: 'Player' }).getByRole('link').first().click();
    await expect(page).toHaveURL(/now-playing/);
    await waitForViewTransition(page);
  }
}

/** Opens the full player page from wherever the player is (side panel, floating player, phone card). */
export async function openFullPlayer(page: Page) {
  if (page.url().includes('/now-playing')) return;
  await page.getByRole('link', { name: 'Open the full player' }).or(page.getByRole('region', { name: 'Player' }).getByRole('link').first()).first().click();
  await expect(page).toHaveURL(/now-playing/);
  await waitForViewTransition(page);
}

/** Any element that can scroll sideways when it shouldn't: a layout overflow bug. */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const offenders: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.right > doc.clientWidth + 1 && getComputedStyle(element).position !== 'fixed') {
        // Items inside a horizontally scrolling shelf are allowed to run past the edge.
        let parent: HTMLElement | null = element.parentElement;
        let scrolls = false;
        while (parent) {
          const overflowX = getComputedStyle(parent).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden') scrolls = true;
          parent = parent.parentElement;
        }
        if (!scrolls) offenders.push(`${element.tagName.toLowerCase()}.${String(element.className).split(' ').slice(0, 3).join('.')}`);
      }
    }
    return { pageScrolls: doc.scrollWidth > doc.clientWidth + 1, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders: offenders.slice(0, 8) };
  });
}

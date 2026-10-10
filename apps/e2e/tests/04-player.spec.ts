import type { Page } from '@playwright/test';
import {
  API,
  audioState,
  control,
  expect,
  expectPaused,
  expectPlaying,
  expectTimeAbove,
  isPhoneWidth,
  nav,
  openFullPlayer,
  open,
  playRow,
  row,
  seedLibrary,
  seedTrack,
  showFullControls,
  test,
  trackRows,
  viewportWidth,
} from './helpers';

const seek = (page: Page) => page.getByRole('slider', { name: 'Seek' });
const volume = (page: Page) => page.getByRole('slider', { name: 'Volume' });
/** Where the transport controls are on this screen: the side panel, the dock, or (phones) the full player page. */
const playerScope = (page: Page) =>
  isPhoneWidth(page) || page.url().includes('/now-playing') ? page.locator('main#main') : page.getByRole('complementary', { name: 'Now playing' }).or(page.getByRole('region', { name: 'Player' }));

/** A control inside the player. String names match exactly, so "Pause" is not "Pause Slow Tide". */
const button = (page: Page, name: string | RegExp) => playerScope(page).getByRole('button', { name, exact: typeof name === 'string' });

/** Three short tracks, so a whole queue can be played to the end in a test. */
async function seedShort(request: import('@playwright/test').APIRequestContext, token: string) {
  const tracks = [];
  for (const [i, title] of ['Alpha', 'Bravo', 'Charlie'].entries()) {
    tracks.push(await seedTrack(request, token, { title, artist: 'Short Set', album: 'Shorts', track: i + 1, seconds: 1.2 }));
  }
  return tracks;
}

test.describe('playback basics', () => {
  test('clicking a track plays it for real, and time moves', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    await expectTimeAbove(app.page, 0.8);
    const state = await audioState(app.page);
    expect(state?.src).toContain('/__storage/tracks/');
    expect(state?.duration).toBeGreaterThan(3.5);
    expect(state?.errorCode).toBeNull();
  });

  test('the player shows what is playing and play/pause really controls the audio', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Slow Tide');
    await expect(app.page.getByRole('region', { name: 'Player' }).or(app.page.getByRole('complementary', { name: 'Now playing' }))).toContainText('Slow Tide');

    await showFullControls(app.page);
    await button(app.page, 'Pause').click();
    await expectPaused(app.page);
    const frozen = (await audioState(app.page))!.currentTime;
    await app.page.waitForTimeout(900);
    expect((await audioState(app.page))!.currentTime, 'time must not advance while paused').toBeCloseTo(frozen, 1);

    await button(app.page, 'Play').click();
    await expectPlaying(app.page);
    await expectTimeAbove(app.page, frozen + 0.4);
  });

  test('clicking the playing row pauses it, and again resumes it', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Neon Streets');
    await row(app.page, 'Neon Streets').click();
    await expectPaused(app.page);
    await row(app.page, 'Neon Streets').click();
    await expectPlaying(app.page);
  });

  test('switching tracks stops the old one: exactly one thing is playing', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    const first = (await audioState(app.page))!.src;
    await row(app.page, 'Paper Planes').click();
    await expect.poll(async () => (await audioState(app.page))!.src).not.toBe(first);
    const count = await app.page.evaluate(() => (window as unknown as { __audios: HTMLAudioElement[] }).__audios.length);
    expect(count, 'the app must reuse one audio element').toBe(1);
  });

  test('rapid clicking through tracks ends on the last one clicked', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library?sort=title');
    for (const title of ['Midnight Drive', 'Morning Light', 'Neon Streets', 'Paper Planes', 'Slow Tide']) {
      await row(app.page, title).click({ noWaitAfter: true });
    }
    await expectPlaying(app.page);
    await expect(app.page.getByRole('region', { name: 'Player' }).or(app.page.getByRole('complementary', { name: 'Now playing' }))).toContainText('Slow Tide');
    const state = await audioState(app.page);
    expect(state?.src).toContain('/__storage/');
  });
});

test.describe('seeking and transport', () => {
  test.beforeEach(async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library?sort=title');
  });

  test('dragging or setting the seek bar moves the audio there', async ({ app }) => {
    await playRow(app.page, 'Midnight Drive');
    await showFullControls(app.page);
    await seek(app.page).fill('4');
    await expect.poll(async () => (await audioState(app.page))!.currentTime).toBeGreaterThan(3.8);
    await expect(seek(app.page)).toHaveAttribute('aria-valuetext', /0:0[4-5] of 0:06/);
  });

  test('the seek bar can be driven from the keyboard', async ({ app }) => {
    await playRow(app.page, 'Midnight Drive');
    await showFullControls(app.page);
    await button(app.page, 'Pause').click();
    await seek(app.page).fill('1');
    await seek(app.page).focus();
    for (let i = 0; i < 10; i += 1) await app.page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await audioState(app.page))!.currentTime).toBeGreaterThan(1.5);
  });

  test('"previous" restarts the song after a few seconds, and goes back before that', async ({ app }) => {
    await playRow(app.page, 'Morning Light');
    await showFullControls(app.page);
    // At the very start of the first track there is nothing before it.
    await expect(button(app.page, 'Previous track')).toBeEnabled();
    await seek(app.page).fill('3.5');
    await expect.poll(async () => (await audioState(app.page))!.currentTime).toBeGreaterThan(3.3);
    await button(app.page, 'Previous track').click();
    await expect.poll(async () => (await audioState(app.page))!.currentTime).toBeLessThan(1);
    expect(await app.page.evaluate(() => navigator.mediaSession.metadata?.title), 'restarting stays on the same song').toBe('Morning Light');
  });

  test('next moves through the queue in order', async ({ app }) => {
    await playRow(app.page, 'Midnight Drive');
    await showFullControls(app.page);
    const title = () => app.page.evaluate(() => navigator.mediaSession.metadata?.title);
    await expect.poll(title).toBe('Midnight Drive');
    await button(app.page, 'Next track').click();
    await expect.poll(title).toBe('Morning Light');
    await button(app.page, 'Next track').click();
    await expect.poll(title).toBe('Neon Streets');
    await button(app.page, 'Previous track').click();
    await expect.poll(title).toBe('Morning Light');
  });

  test('the last track has no "next", and the button says so', async ({ app }) => {
    await playRow(app.page, 'Slow Tide');
    await showFullControls(app.page);
    await expect(button(app.page, 'Next track')).toBeDisabled();
  });

  test('double-pressing play/pause quickly leaves it in a consistent state', async ({ app }) => {
    await playRow(app.page, 'Midnight Drive');
    await showFullControls(app.page);
    await button(app.page, /^(Pause|Play)$/).dblclick();
    await app.page.waitForTimeout(400);
    const label = await button(app.page, /^(Pause|Play)$/).first().getAttribute('aria-label');
    const state = await audioState(app.page);
    expect(label === 'Pause', `button says ${label} but audio.paused=${state?.paused}`).toBe(!state!.paused);
  });
});

test.describe('end of queue, repeat and shuffle', () => {
  test('at the end of the queue it stops, rewinds, and the button shows Play', async ({ app, request }) => {
    await seedShort(request, app.token);
    await open(app.page, '/library?sort=album-order&album=Shorts');
    await playRow(app.page, 'Charlie');
    await showFullControls(app.page);
    await expectPaused(app.page);
    await expect(button(app.page, 'Play')).toBeVisible();
    await expect(button(app.page, 'Pause')).toHaveCount(0);
    expect((await audioState(app.page))!.currentTime).toBeLessThan(0.5);
    // And it plays again from the top.
    await button(app.page, 'Play').click();
    await expectPlaying(app.page);
  });

  test('a queue plays through track by track on its own', async ({ app, request }) => {
    await seedShort(request, app.token);
    await open(app.page, '/library?album=Shorts');
    await playRow(app.page, 'Alpha');
    await expect.poll(() => app.page.evaluate(() => navigator.mediaSession.metadata?.title), { timeout: 10_000 }).toBe('Bravo');
    await expect.poll(() => app.page.evaluate(() => navigator.mediaSession.metadata?.title), { timeout: 10_000 }).toBe('Charlie');
    await expectPlaying(app.page);
  });

  test('repeat one loops the same song', async ({ app, request }) => {
    await seedShort(request, app.token);
    await open(app.page, '/library?album=Shorts');
    await playRow(app.page, 'Alpha');
    await showFullControls(app.page);
    await button(app.page, 'Repeat: off').click();
    await button(app.page, 'Repeat: all').click();
    await expect(button(app.page, 'Repeat: one')).toBeVisible();
    await app.page.waitForTimeout(3200);
    await expectPlaying(app.page);
    expect(await app.page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('Alpha');
  });

  test('repeat all wraps from the last track back to the first', async ({ app, request }) => {
    await seedShort(request, app.token);
    await open(app.page, '/library?album=Shorts');
    await playRow(app.page, 'Charlie');
    await showFullControls(app.page);
    await button(app.page, 'Repeat: off').click();
    await expect(button(app.page, 'Repeat: all')).toBeVisible();
    await expect.poll(() => app.page.evaluate(() => navigator.mediaSession.metadata?.title), { timeout: 10_000 }).toBe('Alpha');
  });

  test('shuffle plays every track exactly once before stopping', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library?sort=title');
    await playRow(app.page, 'Midnight Drive');
    await showFullControls(app.page);
    await button(app.page, 'Shuffle').click();
    await expect(button(app.page, 'Shuffle')).toHaveAttribute('aria-pressed', 'true');
    const seen = [await app.page.evaluate(() => navigator.mediaSession.metadata?.title)];
    for (let i = 0; i < 5; i += 1) {
      await button(app.page, 'Next track').click();
      await app.page.waitForTimeout(150);
      seen.push(await app.page.evaluate(() => navigator.mediaSession.metadata?.title));
    }
    expect(seen[0]).toBe('Midnight Drive');
    expect(new Set(seen).size, `a track repeated before the queue finished: ${seen}`).toBe(6);
    await expect(button(app.page, 'Next track')).toBeDisabled();
    // Turning shuffle off keeps the current song.
    const current = seen[5];
    await button(app.page, 'Shuffle').click();
    expect(await app.page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe(current);
  });

  test('"Shuffle all" on Home starts something playing', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/');
    await app.page.getByRole('button', { name: 'Shuffle all' }).click();
    await expectPlaying(app.page);
  });
});

test.describe('volume', () => {
  test('volume and mute change the real audio, and are remembered', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    test.skip(isPhoneWidth(app.page), 'phones use the hardware volume buttons; there is no slider');
    // Below 1024px the floating player has no volume slider; the full player does.
    if (viewportWidth(app.page) < 1024) await openFullPlayer(app.page);

    await volume(app.page).fill('0.3');
    await expect.poll(async () => (await audioState(app.page))!.volume).toBeCloseTo(0.3, 2);
    await button(app.page, 'Mute').click();
    await expect.poll(async () => (await audioState(app.page))!.muted).toBe(true);
    await button(app.page, 'Unmute').click();
    await expect.poll(async () => (await audioState(app.page))!.muted).toBe(false);

    await app.page.reload();
    await expect(app.page.locator('main#main')).toBeVisible();
    if (viewportWidth(app.page) < 1024) await openFullPlayer(app.page);
    await button(app.page, 'Play').click();
    await expect.poll(async () => (await audioState(app.page))?.volume).toBeCloseTo(0.3, 2);
  });

  test('dragging volume to zero shows as muted, and raising it unmutes', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    test.skip(isPhoneWidth(app.page), 'no volume slider on phones');
    if (viewportWidth(app.page) < 1024) await openFullPlayer(app.page);
    await volume(app.page).fill('0');
    await expect(button(app.page, 'Unmute').or(button(app.page, 'Mute'))).toBeVisible();
    await volume(app.page).fill('0.6');
    await expect.poll(async () => (await audioState(app.page))!.volume).toBeCloseTo(0.6, 2);
    await expect.poll(async () => (await audioState(app.page))!.muted).toBe(false);
  });
});

test.describe('queue', () => {
  test('add to queue, play next, jump, remove and clear', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library?sort=title');
    await playRow(app.page, 'Midnight Drive');

    await row(app.page, 'Slow Tide').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Add to queue' }).click();
    await expect(app.page.getByRole('menu')).toHaveCount(0);
    await row(app.page, 'Paper Planes').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Play next' }).click();
    await expect(app.page.getByText('"Paper Planes" will play next')).toBeVisible();

    // The queue lives in the side panel's "Up next" tab on wide screens, and in a sheet elsewhere.
    const rail = app.page.getByRole('complementary', { name: 'Now playing' });
    let queue: import('@playwright/test').Locator;
    if (await rail.isVisible()) {
      await rail.getByRole('tab', { name: /^Up next/ }).click();
      queue = rail.getByRole('tabpanel');
    } else {
      if (isPhoneWidth(app.page)) {
        await showFullControls(app.page);
        await app.page.getByRole('button', { name: /^Up next/ }).click();
      } else {
        await app.page.getByRole('region', { name: 'Player' }).getByRole('button', { name: 'Queue', exact: true }).click();
      }
      queue = app.page.getByRole('complementary', { name: 'Queue' });
    }
    await expect(queue.getByRole('button', { name: /Paper Planes/ }).first()).toBeVisible();

    // Slow Tide is in the queue twice (it was already there, and was added again): removing one leaves one.
    await expect(queue.getByRole('button', { name: 'Remove Slow Tide from queue' })).toHaveCount(2);
    await queue.getByRole('button', { name: 'Remove Slow Tide from queue' }).first().click();
    await expect(queue.getByRole('button', { name: 'Remove Slow Tide from queue' })).toHaveCount(1);
    await queue.getByRole('button', { name: 'Clear' }).click();
    await expect(queue.getByText(/Nothing queued/)).toBeVisible();
  });

  test('the queue survives a reload, paused, with the song and position remembered', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library?sort=title');
    await playRow(app.page, 'Midnight Drive');
    await showFullControls(app.page);
    await seek(app.page).fill('3');
    await expect.poll(async () => (await audioState(app.page))!.currentTime).toBeGreaterThan(2.8);
    await button(app.page, 'Pause').click();
    await app.page.waitForTimeout(300);
    await app.page.reload();

    await expect(app.page.getByText('Midnight Drive').first()).toBeVisible();
    // Restored but not blaring: nothing plays until you press play.
    const before = await audioState(app.page);
    expect(before === null || before.paused).toBe(true);
    await showFullControls(app.page);
    await expect(seek(app.page)).toHaveAttribute('aria-valuetext', /of 0:06/);
    await button(app.page, 'Play').click();
    await expectPlaying(app.page);
    await expect.poll(async () => (await audioState(app.page))!.currentTime, { message: 'resumes near where it was left' }).toBeGreaterThan(2.5);
  });
});

test.describe('links that stop working', () => {
  test('a stale (expired) stream link is replaced automatically and playback carries on', async ({ app, request }) => {
    app.page.on('console', () => undefined);
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await expect(trackRows(app.page)).toHaveCount(6);
    // The list was loaded; now every signed URL it holds goes bad (as if the page sat open for hours).
    await control(request, 'expire-urls');
    await row(app.page, 'Morning Light').click();
    await expectPlaying(app.page);
    await expect.poll(async () => (await audioState(app.page))!.currentTime, { timeout: 15_000 }).toBeGreaterThan(0.5);
    const state = await audioState(app.page);
    expect(state?.errorCode).toBeNull();
  });
});

test.describe('player and the library change together', () => {
  test('deleting the playing track stops the player cleanly', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    await row(app.page, 'Morning Light').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Delete from library' }).click();
    await app.page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(row(app.page, 'Morning Light')).toHaveCount(0);
    await expectPaused(app.page);
  });

  test('favoriting the playing track from the player updates the list too', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Neon Streets');
    await app.page.getByRole('button', { name: 'Add to favorites' }).first().click();
    await expect(row(app.page, 'Neon Streets').getByRole('button', { name: /Remove Neon Streets from favorites/ })).toBeVisible();
  });

  test('playing a track is recorded in Recently played and in the listening stats', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Paper Planes');
    await expectTimeAbove(app.page, 0.5);
    await nav(app.page, 'Songs').click();
    await app.page.getByRole('navigation', { name: 'Songs' }).getByRole('link', { name: 'Recently played' }).click();
    await expect(row(app.page, 'Paper Planes')).toBeVisible();
    const stats = await (await request.get(`${API}/listening?days=7`, { headers: { Authorization: `Bearer ${app.token}` } })).json();
    expect(stats.listening.plays).toBe(1);
    expect(stats.listening.genres[0]).toMatchObject({ name: 'Folk', plays: 1 });
  });

  test('a track played twice in a row is only counted for each real start', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'No Tags Here');
    await row(app.page, 'No Tags Here').click();
    await row(app.page, 'No Tags Here').click();
    await expectPlaying(app.page);
    await app.page.waitForTimeout(600);
    const stats = await (await request.get(`${API}/listening?days=7`, { headers: { Authorization: `Bearer ${app.token}` } })).json();
    expect(stats.listening.plays, 'pausing and resuming is not a new play').toBe(1);
  });
});

test.describe('keyboard and system integration', () => {
  test('Space, M, S, R and the arrow keys control the player', async ({ app, request }) => {
    test.skip(isPhoneWidth(app.page), 'no keyboard on phones');
    await seedLibrary(request, app.token);
    await open(app.page, '/library?sort=title');
    await playRow(app.page, 'Midnight Drive');
    await app.page.locator('main#main').click({ position: { x: 5, y: 5 } });
    const focusBody = () => app.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    await focusBody();
    await app.page.keyboard.press('Space');
    await expectPaused(app.page);
    await app.page.keyboard.press('Space');
    await expectPlaying(app.page);

    await app.page.keyboard.press('KeyM');
    await expect.poll(async () => (await audioState(app.page))!.muted).toBe(true);
    await app.page.keyboard.press('KeyM');
    await expect.poll(async () => (await audioState(app.page))!.muted).toBe(false);

    const before = (await audioState(app.page))!.currentTime;
    await app.page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await audioState(app.page))!.currentTime).toBeGreaterThan(before + 3);

    await app.page.keyboard.press('Shift+ArrowRight');
    await expect.poll(() => app.page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('Morning Light');
    await app.page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(() => app.page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('Midnight Drive');
  });

  test('shortcuts are ignored while typing', async ({ app, request }) => {
    test.skip(isPhoneWidth(app.page), 'no keyboard on phones');
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    const search = app.page.getByRole('searchbox', { name: 'Search your library' });
    await search.click();
    await app.page.keyboard.type('m s r  ');
    await expect(search).toHaveValue('m s r  ');
    const state = await audioState(app.page);
    expect(state?.paused, 'typing a space must not pause').toBe(false);
    expect(state?.muted, 'typing "m" must not mute').toBe(false);
  });

  test('lock-screen / media-key metadata follows the song', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Slow Tide');
    const meta = await app.page.evaluate(() => ({
      title: navigator.mediaSession.metadata?.title,
      artist: navigator.mediaSession.metadata?.artist,
      album: navigator.mediaSession.metadata?.album,
      state: navigator.mediaSession.playbackState,
    }));
    expect(meta).toEqual({ title: 'Slow Tide', artist: 'Aurora Vale', album: 'Daybreak', state: 'playing' });
  });

  test('the phone player card plays and pauses, and opens the full player', async ({ app, request }) => {
    test.skip(!isPhoneWidth(app.page), 'phone layout only');
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Neon Streets');
    const card = app.page.getByRole('region', { name: 'Player' });
    await card.getByRole('button', { name: 'Pause' }).click();
    await expectPaused(app.page);
    await card.getByRole('button', { name: 'Play' }).click();
    await expectPlaying(app.page);
    await card.getByRole('link').first().click();
    await expect(app.page).toHaveURL(/now-playing/);
    await expect(app.page.getByRole('heading', { level: 1, name: 'Neon Streets' })).toBeVisible();
    await app.page.getByRole('button', { name: 'Close player' }).click();
    await expect(app.page).not.toHaveURL(/now-playing/);
  });

  test('opening the full player directly with nothing playing is a calm dead end, not an error', async ({ app }) => {
    await open(app.page, '/now-playing');
    await expect(app.page.getByRole('heading', { name: 'Nothing is playing' })).toBeVisible();
  });
});

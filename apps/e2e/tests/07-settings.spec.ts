import type { Page } from '@playwright/test';
import { audioState, expect, isPhoneWidth, nav, open, playRow, row, seedLibrary, seedTrack, test, viewportWidth } from './helpers';

/**
 * Waits for the playing track to end: the next one has started, or the queue has stopped. A track
 * left in its first second counts as a skip, and skips are kept out of the listening figures.
 */
async function playedThrough(page: Page) {
  const started = (await audioState(page))!.src;
  await expect.poll(async () => {
    const state = await audioState(page);
    return Boolean(state && (state.src !== started || state.paused));
  }).toBe(true);
  // The end of the play is reported as the track ends; give the request a moment to land.
  await page.waitForTimeout(300);
}

const html = (page: Page, attribute: string) => page.evaluate((name) => document.documentElement.getAttribute(name), attribute);
const cssVar = (page: Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('personalisation', () => {
  test('theme: dark, black and paper change the whole app, and are remembered', async ({ app }) => {
    await open(app.page, '/settings');
    const results: Record<string, string> = {};
    for (const [label, theme] of [['Black', 'oled'], ['Paper', 'light'], ['Dark', 'dark']] as const) {
      await app.page.getByRole('button', { name: new RegExp(`${label}$`) }).click();
      await expect.poll(() => html(app.page, 'data-theme')).toBe(theme);
      results[theme] = await background(app.page);
    }
    expect(new Set(Object.values(results)).size, `three themes must look different: ${JSON.stringify(results)}`).toBe(3);

    await app.page.getByRole('button', { name: /Paper$/ }).click();
    await app.page.reload();
    // Applied before the app even starts, so there is no flash of the wrong colours.
    expect(await html(app.page, 'data-theme')).toBe('light');
    await expect(app.page.getByRole('button', { name: /Paper$/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('"Match device" follows the operating system, live', async ({ app }) => {
    await open(app.page, '/settings');
    await app.page.getByRole('button', { name: /Match device$/ }).click();
    await app.page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => html(app.page, 'data-theme')).toBe('light');
    await app.page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => html(app.page, 'data-theme')).toBe('dark');
  });

  test('every accent colour applies', async ({ app }) => {
    await open(app.page, '/settings');
    const seen = new Set<string>();
    const accents: [label: string, key: string][] = [['Vermilion', 'orange'], ['Ochre', 'amber'], ['Jade', 'emerald'], ['Teal', 'cyan'], ['Cobalt', 'blue'], ['Violet', 'violet'], ['Rose', 'rose'], ['Orchid', 'pink']];
    for (const [label, key] of accents) {
      await app.page.getByRole('button', { name: label, exact: true }).click();
      await expect.poll(() => html(app.page, 'data-accent')).toBe(key);
      seen.add(await cssVar(app.page, '--c-accent'));
    }
    expect(seen.size, 'each accent must be a different colour').toBe(8);
  });

  test('settings survive a reload and can be reset', async ({ app }) => {
    await open(app.page, '/settings');
    await app.page.getByRole('button', { name: /Black$/ }).click();
    await app.page.getByRole('button', { name: 'Rose', exact: true }).click();
    await app.page.getByRole('radio', { name: 'Compact' }).or(app.page.getByRole('button', { name: 'Compact', exact: true })).first().click();
    await app.page.reload();
    expect(await html(app.page, 'data-theme')).toBe('oled');
    expect(await html(app.page, 'data-accent')).toBe('rose');
    await app.page.getByRole('button', { name: 'Reset settings' }).click();
    await expect(app.page.getByText('Settings reset to defaults')).toBeVisible();
    await expect.poll(() => html(app.page, 'data-theme')).toBe('dark');
    await expect.poll(() => html(app.page, 'data-accent')).toBe('orange');
  });

  test('"Reduced" motion switches animation off app-wide', async ({ app }) => {
    await open(app.page, '/settings');
    await app.page.getByRole('button', { name: 'Reduced', exact: true }).click();
    await expect.poll(() => html(app.page, 'data-reduce-motion')).toBe('true');
    await app.page.getByRole('button', { name: 'On', exact: true }).click();
    await expect.poll(() => html(app.page, 'data-reduce-motion')).toBe('false');
  });

  test('"Auto" motion respects the operating-system setting', async ({ app }) => {
    await open(app.page, '/settings');
    await app.page.getByRole('button', { name: 'Auto', exact: true }).click();
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => html(app.page, 'data-reduce-motion')).toBe('true');
    await app.page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(() => html(app.page, 'data-reduce-motion')).toBe('false');
  });

  test('with reduced motion, nothing is left animating on the page', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    await app.page.waitForTimeout(600);
    const running = await app.page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === 'running' && (animation.effect?.getComputedTiming().iterations ?? 1) === Infinity)
        .map((animation) => (animation as CSSAnimation).animationName ?? animation.id),
    );
    expect(running, 'endless animations must stop').toEqual([]);
  });

  test('compact density makes rows shorter; hiding artwork removes the covers', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    const height = () => row(app.page, 'Morning Light').evaluate((element) => element.getBoundingClientRect().height);
    const comfortable = await height();
    await open(app.page, '/settings');
    await app.page.getByRole('button', { name: 'Compact', exact: true }).click();
    await open(app.page, '/library');
    expect(await height()).toBeLessThan(comfortable);

    await open(app.page, '/settings');
    await app.page.getByRole('switch', { name: 'Artwork in track lists' }).click();
    await open(app.page, '/library');
    await expect(row(app.page, 'Morning Light').locator('img, .art-fallback')).toHaveCount(0);
  });

  test('the playing indicator can be bars, a pulse or a dot', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    for (const [label, selector] of [['Bars', '.animate-equalizer'], ['Pulse', '.animate-pulse2'], ['Dot', 'span.rounded-full.bg-accent']] as const) {
      await open(app.page, '/settings');
      await app.page.getByRole('button', { name: label, exact: true }).click();
      await open(app.page, '/library');
      await playRow(app.page, 'Morning Light');
      await app.page.mouse.move(2, 2);
      await expect(row(app.page, 'Morning Light').locator(selector).first(), label).toBeVisible();
    }
  });

  test('the default song order is used by the library', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/settings');
    await app.page.getByLabel('Default song order').selectOption({ label: 'Title' });
    await open(app.page, '/library');
    await expect(app.page.locator('main#main ul.stagger > li').first()).toContainText('Midnight Drive');
  });

  test('the side panel can be turned off, and the floating player takes over', async ({ app, request }) => {
    test.skip(viewportWidth(app.page) < 1280, 'the side panel only exists on wide screens');
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    await expect(app.page.getByRole('complementary', { name: 'Now playing' })).toBeVisible();
    await app.page.getByRole('button', { name: 'Hide the side panel' }).click();
    await expect(app.page.getByRole('complementary', { name: 'Now playing' })).toHaveCount(0);
    await expect(app.page.getByRole('region', { name: 'Player' })).toBeVisible();
    await app.page.getByRole('button', { name: 'Show the side panel' }).click();
    await expect(app.page.getByRole('complementary', { name: 'Now playing' })).toBeVisible();
  });

  test('"resume" off starts every visit with an empty player', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/settings');
    await app.page.getByRole('switch', { name: 'Resume where you left off' }).click();
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    await app.page.reload();
    await expect(app.page.getByRole('complementary', { name: 'Now playing' })).toHaveCount(0);
    await expect(app.page.getByRole('region', { name: 'Player' })).toHaveCount(0);
  });

  test('"Clear queue and history" stops playback and empties the player', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    await nav(app.page, 'Home').click();
    await app.page.goto('/settings');
    // A full reload restores the queue paused; clearing removes it.
    await app.page.getByRole('button', { name: 'Clear queue and history' }).click();
    await app.page.getByRole('dialog').getByRole('button', { name: 'Clear' }).click();
    await expect(app.page.getByText('Player cleared')).toBeVisible();
    await expect(app.page.getByRole('complementary', { name: 'Now playing' })).toHaveCount(0);
    await expect(app.page.getByRole('region', { name: 'Player' })).toHaveCount(0);
  });
});

test.describe('settings: information', () => {
  test('library numbers and server status are real', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/settings');
    const stats = app.page.locator('section', { has: app.page.getByRole('heading', { name: 'Library', exact: true }) });
    await expect(stats.getByText('Tracks').locator('..')).toContainText('6');
    await expect(stats.getByText('Albums').locator('..')).toContainText('3');
    await expect(stats.getByText('Favorites').locator('..')).toContainText('1');
    await expect(app.page.getByText('Connected', { exact: true })).toBeVisible();
    await expect(app.page.getByText(/is reachable/)).toBeVisible();
  });

  test('the listening card shows plays by genre once you have listened', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/settings');
    await expect(app.page.getByText(/No plays recorded/)).toBeVisible();
    // From its album, where it is the only track, so nothing plays after it.
    await open(app.page, '/library?album=Small%20Things&albumArtist=Juniper');
    await playRow(app.page, 'Paper Planes');
    await expect.poll(async () => (await app.page.evaluate(() => navigator.mediaSession.playbackState))).toBe('playing');
    await playedThrough(app.page);
    await nav(app.page, 'Home').click();
    await open(app.page, '/settings');
    const listening = app.page.locator('section', { has: app.page.getByRole('heading', { name: 'Listening', exact: true }) });
    await expect(listening.getByText('Folk')).toBeVisible();
    await expect(listening.getByText('1 · 100%')).toBeVisible();
    for (const period of ['7 days', 'Year', '30 days']) {
      await listening.getByRole('button', { name: period }).click();
      await expect(listening.getByText('Folk')).toBeVisible();
    }
  });

  test('the install section explains how to get the app', async ({ app }) => {
    await open(app.page, '/settings');
    await expect(app.page.getByRole('heading', { name: 'App', exact: true })).toBeVisible();
    await expect(app.page.getByText(/Install from your browser's menu|Install app|Installed/).first()).toBeVisible();
  });

  test('the shortcuts list is complete', async ({ app }) => {
    test.skip(isPhoneWidth(app.page), 'shortcuts are for keyboards');
    await open(app.page, '/settings');
    const shortcuts = app.page.locator('section', { has: app.page.getByRole('heading', { name: 'Shortcuts', exact: true }) });
    for (const text of ['Play / pause', 'Mute', 'Shuffle', 'Repeat', 'Search']) await expect(shortcuts.getByText(text, { exact: false }).first()).toBeVisible();
  });

  test('a track played with no genre is listed as Unknown, not dropped', async ({ app, request }) => {
    await seedTrack(request, app.token, { title: 'Genreless' });
    await open(app.page, '/library');
    await playRow(app.page, 'Genreless');
    await playedThrough(app.page);
    await open(app.page, '/settings');
    await expect(app.page.getByText('Unknown', { exact: true })).toBeVisible();
  });
});

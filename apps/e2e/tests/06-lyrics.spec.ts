import type { Page } from '@playwright/test';
import { audioState, control, expect, expectPlaying, open, playRow, seedTrack, showFullControls, test, viewportWidth } from './helpers';

const SYNCED = '[00:00.50]First line here\n[00:02.00]Second line here\n[00:04.00]Third line here';

/** Opens the lyrics wherever they live: a tab in the side panel, or a toggle on the full player page. */
async function openLyrics(page: Page) {
  const rail = page.getByRole('complementary', { name: 'Now playing' });
  if (await rail.isVisible()) {
    await rail.getByRole('tab', { name: 'Lyrics' }).click();
  } else {
    // Already on the full player (e.g. after a reload there)? Nothing to open.
    if (!page.url().includes('/now-playing')) {
      if (viewportWidth(page) >= 768) await page.getByRole('region', { name: 'Player' }).getByRole('link', { name: 'Open the full player' }).click();
      else await showFullControls(page);
    }
    await expect(page).toHaveURL(/now-playing/);
    const toggle = page.getByRole('button', { name: 'Lyrics', exact: true });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  }
  const lyrics = page.getByRole('region', { name: 'Lyrics' });
  await expect(lyrics).toBeVisible();
  return lyrics;
}

test.describe('lyrics', () => {
  test.beforeEach(async ({ app, request }) => {
    await seedTrack(request, app.token, { title: 'Sing Along', artist: 'Chorus Line', album: 'Verses', seconds: 8 });
  });

  test('synced lyrics follow the song, and tapping a line jumps there', async ({ app, request }) => {
    await control(request, 'lyrics', { lyrics: { plainLyrics: 'First line here\nSecond line here\nThird line here', syncedLyrics: SYNCED } });
    await open(app.page, '/library');
    await playRow(app.page, 'Sing Along');
    const lyrics = await openLyrics(app.page);

    await expect(lyrics.getByRole('button', { name: 'First line here' })).toBeVisible();
    await expect(lyrics.getByText('From LRCLIB')).toBeVisible();
    // The current line is the one at full strength; it moves as the song plays.
    await expect(lyrics.getByRole('button', { name: 'First line here' })).toHaveClass(/opacity-100/);
    await expect(lyrics.getByRole('button', { name: 'Second line here' })).toHaveClass(/opacity-100/, { timeout: 8000 });

    await lyrics.getByRole('button', { name: 'Third line here' }).click();
    await expect.poll(async () => (await audioState(app.page))!.currentTime).toBeGreaterThan(3.8);
    await expect(lyrics.getByRole('button', { name: 'Third line here' })).toHaveClass(/opacity-100/);
  });

  test('plain lyrics are shown as text', async ({ app, request }) => {
    await control(request, 'lyrics', { lyrics: { plainLyrics: 'Roses are red\nViolets are blue', syncedLyrics: null } });
    await open(app.page, '/library');
    await playRow(app.page, 'Sing Along');
    const lyrics = await openLyrics(app.page);
    await expect(lyrics.getByText('Roses are red')).toBeVisible();
    await expect(lyrics.getByText('Violets are blue')).toBeVisible();
  });

  test('no lyrics found says so, and does not ask the service again and again', async ({ app, request }) => {
    await open(app.page, '/library');
    await playRow(app.page, 'Sing Along');
    const lyrics = await openLyrics(app.page);
    await expect(lyrics.getByText('No lyrics for this track.')).toBeVisible();
    const calls = async () => (await (await control(request, 'state')).json()).lyricsCalls as number;
    expect(await calls()).toBe(1);
    // Reload and ask again: a remembered miss is not looked up a second time.
    await app.page.reload();
    await showFullControls(app.page);
    const again = await openLyrics(app.page);
    await expect(again.getByText('No lyrics for this track.')).toBeVisible();
    expect(await calls()).toBe(1);
  });

  test('searching again can find lyrics that were missing', async ({ app, request }) => {
    await open(app.page, '/library');
    await playRow(app.page, 'Sing Along');
    const lyrics = await openLyrics(app.page);
    await expect(lyrics.getByText('No lyrics for this track.')).toBeVisible();
    await control(request, 'lyrics', { lyrics: { plainLyrics: 'Found them at last', syncedLyrics: null } });
    await lyrics.getByRole('button', { name: 'Search for lyrics again' }).click();
    await expect(lyrics.getByText('Found them at last')).toBeVisible();
  });

  test('you can type your own lyrics, and they are kept', async ({ app }) => {
    await open(app.page, '/library');
    await playRow(app.page, 'Sing Along');
    const lyrics = await openLyrics(app.page);
    await lyrics.getByRole('button', { name: 'Edit lyrics' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Edit lyrics' });
    await dialog.getByLabel('Lyrics').fill('[00:01.00]My own words\n[00:03.00]More of my words');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(app.page.getByText('Lyrics saved')).toBeVisible();
    await expect(lyrics.getByRole('button', { name: 'My own words' })).toBeVisible();
    await expect(lyrics.getByText('Added by you')).toBeVisible();
    // Searching again must never overwrite what you wrote.
    await expect(lyrics.getByRole('button', { name: 'Search for lyrics again' })).toBeDisabled();
  });

  test('lyrics can be cleared by saving an empty box', async ({ app }) => {
    await open(app.page, '/library');
    await playRow(app.page, 'Sing Along');
    const lyrics = await openLyrics(app.page);
    await lyrics.getByRole('button', { name: 'Edit lyrics' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Edit lyrics' });
    await dialog.getByLabel('Lyrics').fill('Something');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(lyrics.getByText('Something')).toBeVisible();
    await lyrics.getByRole('button', { name: 'Edit lyrics' }).click();
    await app.page.getByRole('dialog').getByLabel('Lyrics').fill('');
    await app.page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(lyrics.getByText('No lyrics for this track.')).toBeVisible();
  });

  test('HTML inside lyrics is shown as text and never runs', async ({ app, request }) => {
    await control(request, 'lyrics', { lyrics: { plainLyrics: '<img src=x onerror="window.__lyr=1"><script>window.__lyr=2</script>', syncedLyrics: null } });
    await open(app.page, '/library');
    await playRow(app.page, 'Sing Along');
    const lyrics = await openLyrics(app.page);
    await expect(lyrics.getByText('<img src=x')).toBeVisible();
    expect(await app.page.evaluate(() => (window as unknown as { __lyr?: number }).__lyr)).toBeUndefined();
  });

  test('turning off lookups means the service is never contacted', async ({ app, request }) => {
    await control(request, 'lyrics', { lyrics: { plainLyrics: 'Should not be fetched', syncedLyrics: null } });
    await app.page.addInitScript(() => {
      if (!localStorage.getItem('mp3-player:settings')) {
        localStorage.setItem('mp3-player:settings', JSON.stringify({ state: { lyricsAutoFetch: false }, version: 1 }));
      }
    });
    await open(app.page, '/library');
    await playRow(app.page, 'Sing Along');
    const lyrics = await openLyrics(app.page);
    await expect(lyrics.getByText('No lyrics for this track.')).toBeVisible();
    expect((await (await control(request, 'state')).json()).lyricsCalls).toBe(0);
    // But you can still ask on purpose.
    await lyrics.getByRole('button', { name: 'Search LRCLIB' }).click();
    await expect(lyrics.getByText('Should not be fetched')).toBeVisible();
  });

  test('when the lyrics service is down, the song keeps playing and the message is plain', async ({ app, request, expectErrors }) => {
    expectErrors(/status of 502/);
    await control(request, 'lyrics', { status: 503 });
    await open(app.page, '/library');
    await playRow(app.page, 'Sing Along');
    const lyrics = await openLyrics(app.page);
    await expect(lyrics.getByText(/could not be reached/i)).toBeVisible();
    await expectPlaying(app.page);
  });

  test('very long lyrics are accepted up to the limit, and refused politely beyond it', async ({ app, expectErrors }) => {
    expectErrors(/status of 400/);
    await open(app.page, '/library');
    await playRow(app.page, 'Sing Along');
    const lyrics = await openLyrics(app.page);
    await lyrics.getByRole('button', { name: 'Edit lyrics' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Edit lyrics' });
    await dialog.getByLabel('Lyrics').fill('la '.repeat(20_000));
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(app.page.getByText(/too long/i)).toBeVisible();
    await expect(dialog).toBeVisible();
  });
});

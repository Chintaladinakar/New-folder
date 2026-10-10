import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { control, expect, open, playRow, seedTrack, test } from './helpers';

// Not pass/fail checks: this takes the screenshots that get looked at by eye. Run on demand:
//   npx playwright test tests/12-visual.spec.ts

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'results', 'screens');

const LIBRARY = [
  { title: 'Morning Light', artist: 'Aurora Vale', album: 'Daybreak', genre: 'Ambient', year: 2019, track: 1, seconds: 8 },
  { title: 'Slow Tide', artist: 'Aurora Vale', album: 'Daybreak', genre: 'Ambient', year: 2019, track: 2, seconds: 9 },
  { title: 'Neon Streets', artist: 'The Night Owls', album: 'After Hours', genre: 'Synthwave', year: 1987, track: 1, seconds: 7 },
  { title: 'Midnight Drive With A Much Longer Title That Should Truncate Cleanly', artist: 'The Night Owls', album: 'After Hours', genre: 'Synthwave', year: 1987, track: 2, seconds: 6, favorite: true },
  { title: 'Paper Planes', artist: 'Juniper', album: 'Small Things', genre: 'Folk', year: 2008, track: 1, seconds: 5 },
  { title: 'No Tags Here', seconds: 4 },
];

test('screenshots of every page, in every theme', async ({ app, request }, testInfo) => {
  test.setTimeout(240_000);
  const project = testInfo.project.name;
  await mkdir(OUT, { recursive: true });
  for (const row of LIBRARY) await seedTrack(request, app.token, row);
  await control(request, 'lyrics', {
    lyrics: { plainLyrics: 'First line here\nSecond line here\nThird line here', syncedLyrics: '[00:00.50]First line here\n[00:02.00]Second line here\n[00:04.00]Third line here' },
  });
  const shot = (name: string) => app.page.screenshot({ path: join(OUT, `${project}-${name}.png`), fullPage: false });

  for (const [theme, label] of [['dark', /Dark$/], ['paper', /Paper$/], ['black', /Black$/]] as const) {
    await open(app.page, '/settings');
    await app.page.getByRole('button', { name: label }).click();
    await app.page.waitForTimeout(400);

    for (const [name, path] of [
      ['home', '/'],
      ['songs', '/library'],
      ['albums', '/albums'],
      ['artists', '/artists'],
      ['playlists', '/playlists'],
      ['settings', '/settings'],
    ] as const) {
      await open(app.page, path);
      await app.page.waitForTimeout(1100);
      await shot(`${theme}-${name}`);
    }

    // With something playing, and the filter panel open.
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    await app.page.getByRole('button', { name: 'Filters' }).click();
    await app.page.waitForTimeout(900);
    await shot(`${theme}-songs-playing-filters`);

    await app.page.goto('/now-playing');
    await app.page.waitForTimeout(1200);
    await shot(`${theme}-now-playing`);
  }
  expect(true).toBe(true);
});

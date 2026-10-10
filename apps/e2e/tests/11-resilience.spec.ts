import { API, expect, nav, open, row, seedLibrary, seedTrack, test, trackRows } from './helpers';

const BROKEN = [/status of 5\d\d/, /Failed to load resource/, /net::ERR/, /JSON/];

test.describe('when the server misbehaves', () => {
  test('the server is unreachable: every page shows a message and a way to retry', async ({ app, request, expectErrors }) => {
    expectErrors(...BROKEN);
    await seedLibrary(request, app.token);
    await app.page.route(`${API}/**`, (route) => route.abort('connectionrefused'));
    for (const path of ['/', '/library', '/albums', '/artists', '/playlists']) {
      await open(app.page, path);
      await expect(app.page.getByRole('alert').first(), `${path} shows a clear error`).toBeVisible({ timeout: 15_000 });
    }
    await expect(app.page.getByRole('button', { name: 'Try again' }).or(app.page.getByText(/Try again/)).first()).toBeVisible();
  });

  test('retrying after the server comes back works without a reload', async ({ app, request, expectErrors }) => {
    expectErrors(...BROKEN);
    await seedLibrary(request, app.token);
    await app.page.route(`${API}/tracks?*`, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Something went wrong on the server"}' }));
    await open(app.page, '/library');
    await expect(app.page.getByText('Something went wrong on the server')).toBeVisible({ timeout: 15_000 });
    await app.page.unroute(`${API}/tracks?*`);
    await app.page.getByRole('button', { name: 'Try again' }).click();
    await expect(trackRows(app.page)).toHaveCount(6);
  });

  test('a garbled answer from the server is an error message, not a blank screen', async ({ app, request, expectErrors }) => {
    expectErrors(...BROKEN);
    await seedLibrary(request, app.token);
    await app.page.route(`${API}/albums`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '<html>proxy error</html>' }));
    await open(app.page, '/albums');
    await expect(app.page.locator('main#main')).toBeVisible();
    await expect(app.page.getByRole('heading', { name: 'Albums', level: 1 })).toBeVisible();
    await expect(app.page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  });

  test('a response with missing fields does not crash the page', async ({ app, request, expectErrors }) => {
    expectErrors(...BROKEN);
    await seedLibrary(request, app.token);
    await app.page.route(`${API}/tracks?*`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tracks: [{ id: 'x1', title: 'Sparse' }, { id: 'x2', title: 'Nulls', artist: null, album: null, duration: null, streamUrl: null, artworkUrl: null }], total: 2 }),
      }),
    );
    await open(app.page, '/library');
    await expect(row(app.page, 'Sparse')).toBeVisible();
    await expect(row(app.page, 'Nulls')).toBeVisible();
    await expect(app.page.getByRole('heading', { name: 'Songs', level: 1 })).toBeVisible();
  });

  test('a slow server shows loading placeholders, then the real content', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await app.page.route(`${API}/tracks?*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      await route.continue();
    });
    await open(app.page, '/library');
    await expect(app.page.getByRole('status', { name: 'Loading' })).toBeVisible();
    await expect(trackRows(app.page)).toHaveCount(6, { timeout: 15_000 });
    await expect(app.page.getByRole('status', { name: 'Loading' })).toHaveCount(0);
  });

  test('answers that arrive out of order never show stale results', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await expect(trackRows(app.page)).toHaveCount(6);
    // The first search is slow, the second is fast: the slow one lands last and must be ignored.
    await app.page.route(`${API}/tracks?*q=night*`, async (route) => {
      if (route.request().url().includes('q=night%20owls') || route.request().url().includes('q=night+owls')) return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });
    const search = app.page.getByRole('searchbox', { name: 'Search your library' });
    await search.fill('night');
    await app.page.waitForTimeout(450);
    await search.fill('night owls');
    await app.page.waitForTimeout(3500);
    await expect(app.page).toHaveURL(/q=night(%20|\+)owls/);
    await expect(trackRows(app.page)).toHaveCount(2);
  });

  test('a rejected save explains itself and leaves the screen as it was', async ({ app, request, expectErrors }) => {
    expectErrors(...BROKEN);
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await app.page.route(`${API}/tracks/*`, (route) => (route.request().method() === 'PATCH' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Something went wrong on the server"}' }) : route.continue()));
    await row(app.page, 'Paper Planes').getByRole('button', { name: /Remove Paper Planes from favorites/ }).click();
    await expect(app.page.getByText('Something went wrong on the server')).toBeVisible();
    await expect(row(app.page, 'Paper Planes').getByRole('button', { name: /Remove Paper Planes from favorites/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('expired sign-in during an action returns you to the sign-in screen', async ({ app, request, expectErrors }) => {
    expectErrors(/status of 401/);
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await app.page.route(`${API}/tracks/*`, (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Please sign in again"}' }));
    await row(app.page, 'Morning Light').getByRole('button', { name: /Add Morning Light to favorites/ }).click();
    await expect(app.page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });
});

test.describe('rough handling', () => {
  test('hammering the favourite button ends in the state of the last click', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    const heart = () => row(app.page, 'Neon Streets').getByRole('button', { name: /favorites/ });
    for (let i = 0; i < 7; i += 1) await heart().click({ noWaitAfter: true, force: true });
    await app.page.waitForTimeout(1500);
    // 7 clicks from "off" is "on"; the UI and the server must agree on that.
    await expect(heart()).toHaveAttribute('aria-pressed', 'true');
    const list = await (await request.get(`${API}/tracks?favorite=true`, { headers: { Authorization: `Bearer ${app.token}` } })).json();
    expect(list.tracks.map((t: { title: string }) => t.title)).toContain('Neon Streets');
  });

  test('clicking through every section 30 times in a row leaves no errors behind', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/');
    const names = ['Songs', 'Albums', 'Artists', 'Playlists', 'Home'];
    for (let i = 0; i < 30; i += 1) await nav(app.page, names[i % names.length]).click({ noWaitAfter: true });
    await expect(app.page.locator('main#main')).toBeVisible();
    await app.page.waitForTimeout(800);
  });

  test('back and forward walk through filters and pages as expected', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await nav(app.page, 'Albums').click();
    await app.page.getByRole('link', { name: /Daybreak/ }).click();
    await expect(app.page).toHaveURL(/album=Daybreak/);
    await expect(trackRows(app.page)).toHaveCount(2);
    await app.page.goBack();
    await expect(app.page).toHaveURL(/\/albums/);
    await app.page.goBack();
    await expect(app.page).toHaveURL(/\/library$/);
    await expect(trackRows(app.page)).toHaveCount(6);
    await app.page.goForward();
    await expect(app.page).toHaveURL(/\/albums/);
  });

  test('refreshing on any page keeps you there', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    for (const path of ['/library?q=night', '/albums', '/artists', '/playlists', '/settings', '/favorites', '/recently-added']) {
      await open(app.page, path);
      await app.page.reload();
      await expect(app.page.locator('main#main')).toBeVisible();
      expect(new URL(app.page.url()).pathname + new URL(app.page.url()).search.replace(/%20/g, '+')).toContain(path.split('?')[0]);
    }
  });

  test('an address that does not exist shows a friendly page with a way home', async ({ app }) => {
    await open(app.page, '/definitely/not/a/page');
    await expect(app.page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await app.page.getByRole('link', { name: 'Go home' }).click();
    await expect(app.page).toHaveURL(/\/$/);
  });

  test('two tabs: signing out in one signs out the other on its next request', async ({ app, request, context, expectErrors }) => {
    expectErrors(/status of 401/);
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    const second = await context.newPage();
    await second.goto('/library');
    await expect(second.locator('main#main')).toBeVisible();
    await app.page.getByRole('button', { name: 'Account' }).click();
    await app.page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(app.page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await second.reload();
    await expect(second.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await second.close();
  });

  test('a track whose file has gone missing fails gracefully, and the next one still plays', async ({ app, request, expectErrors }) => {
    expectErrors(/status of 404/, /Failed to load resource/, /MEDIA_ELEMENT_ERROR/);
    const broken = await seedTrack(request, app.token, { title: 'Missing File', seconds: 2 });
    await seedTrack(request, app.token, { title: 'Healthy', seconds: 3 });
    // The audio behind one track goes missing, as if the bucket had lost it.
    const info = await (await request.get(`${API}/tracks/${broken.id}`, { headers: { Authorization: `Bearer ${app.token}` } })).json();
    const storagePath = new URL(info.track.streamUrl).pathname;
    await app.page.route(`**${storagePath}*`, (route) => route.fulfill({ status: 404, body: 'gone' }));

    await open(app.page, '/library?sort=title');
    await row(app.page, 'Missing File').click();
    // The player markup holds both a phone card and a wide dock; only one of them is on screen.
    await expect(app.page.getByText(/could not be played/i).locator('visible=true').first()).toBeVisible({ timeout: 15_000 });
    await expect(app.page.locator('main#main')).toBeVisible();

    await row(app.page, 'Healthy').click();
    await expect.poll(() => app.page.evaluate(() => (window as unknown as { __audios: HTMLAudioElement[] }).__audios[0]?.paused)).toBe(false);
    await expect(app.page.getByText(/could not be played/i)).toHaveCount(0);
  });
});

import { control, expect, nav, open, seedLibrary, test } from './helpers';

// First tests to run: if the harness itself is broken, these say so before anything else does.
test.describe('smoke', () => {
  test('backend and app are up, and a signed-in session reaches Home', async ({ app, request }) => {
    const health = await request.get('http://localhost:4010/api/health');
    expect(await health.json()).toMatchObject({ ok: true, database: 'ok' });

    await open(app.page, '/');
    await expect(app.page).toHaveTitle(/Sangeetham/i);
    await expect(app.page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('every main section opens without errors', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/');
    for (const [name, url] of [
      ['Songs', /\/library/],
      ['Albums', /\/albums/],
      ['Artists', /\/artists/],
      ['Playlists', /\/playlists/],
      ['Home', /\/$/],
    ] as const) {
      await nav(app.page, name).click();
      await expect(app.page).toHaveURL(url);
      await expect(app.page.locator('main#main')).toBeVisible();
    }
  });

  test('control endpoint works', async ({ request }) => {
    const response = await control(request, 'state');
    expect(response.ok()).toBeTruthy();
  });
});

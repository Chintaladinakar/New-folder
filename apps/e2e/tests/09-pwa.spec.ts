import { API, expect, open, seedLibrary, test } from './helpers';

test.describe('installable app', () => {
  test('the web app manifest is complete and every icon it names exists', async ({ app, request }) => {
    await open(app.page, '/');
    const href = await app.page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href, 'the page links its manifest').toBeTruthy();
    const manifest = await (await request.get(new URL(href!, app.page.url()).toString())).json();

    expect(manifest).toMatchObject({ name: expect.any(String), short_name: expect.any(String), display: 'standalone', start_url: '/', scope: '/' });
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);

    const sizes = manifest.icons.map((icon: { sizes: string; purpose?: string }) => `${icon.sizes}${icon.purpose ? `:${icon.purpose}` : ''}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512:maskable']));
    for (const icon of manifest.icons as { src: string; type: string }[]) {
      const response = await request.get(new URL(icon.src, app.page.url()).toString());
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()['content-type'], icon.src).toContain(icon.type.split('/')[1]);
    }
  });

  test('the page declares what a phone needs to treat it as an app', async ({ app }) => {
    await open(app.page, '/');
    await expect(app.page.locator('meta[name="theme-color"]')).toHaveAttribute('content', /^#[0-9a-f]{6}$/i);
    await expect(app.page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
    await expect(app.page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /apple-touch-icon\.png/);
    await expect(app.page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  });

  test('the theme colour of the browser frame follows the chosen theme', async ({ app }) => {
    await open(app.page, '/settings');
    const colour = () => app.page.locator('meta[name="theme-color"]').getAttribute('content');
    await app.page.getByRole('button', { name: /Paper$/ }).click();
    await expect.poll(colour).toMatch(/^#f/i);
    await app.page.getByRole('button', { name: /Black$/ }).click();
    await expect.poll(colour).toBe('#000000');
  });
});

test.describe('offline', () => {
  test('a service worker takes over, and the app shell opens with no network', async ({ app, context, expectErrors }) => {
    // With no network the browser itself reports each request it could not make.
    expectErrors(/ERR_INTERNET_DISCONNECTED/);
    await open(app.page, '/');
    await app.page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    // The worker controls the page from its next load.
    await app.page.reload();
    await expect.poll(() => app.page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    await app.page.reload();
    // The app itself still starts (its code and fonts are cached); only the data is missing.
    await expect(app.page.locator('main#main')).toBeVisible();
    await expect(app.page.getByRole('navigation', { name: 'Main' }).first()).toBeAttached();
    await context.setOffline(false);
  });

  test('deep links open offline too, instead of the browser\'s "no internet" page', async ({ app, context, expectErrors }) => {
    expectErrors(/ERR_INTERNET_DISCONNECTED/);
    await open(app.page, '/');
    await app.page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await app.page.reload();
    await expect.poll(() => app.page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await context.setOffline(true);
    await app.page.goto('/playlists');
    await expect(app.page.locator('main#main')).toBeVisible();
    await context.setOffline(false);
  });

  test('music, artwork and API answers are never stored by the service worker', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await app.page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await app.page.reload();
    await expect(app.page.locator('main#main ul.stagger > li').first()).toBeVisible();
    const cached = await app.page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) for (const entry of await (await caches.open(name)).keys()) urls.push(entry.url);
      return urls;
    });
    expect(cached.length, 'the app shell is cached').toBeGreaterThan(5);
    expect(cached.filter((url) => /\/api\/|__storage|\.wav|\.mp3|signature|epoch=/.test(url)), 'private data must not be cached').toEqual([]);
  });

  test('going offline mid-use shows a clear error, and the app recovers when the network returns', async ({ app, request, context, expectErrors }) => {
    expectErrors(/Failed to load resource|net::ERR/);
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await expect(app.page.locator('main#main ul.stagger > li').first()).toBeVisible();
    await context.setOffline(true);
    await app.page.locator('main#main ul.stagger > li').first().getByRole('button', { name: /Add .* to favorites/ }).click();
    await expect(app.page.getByRole('alert').or(app.page.getByText(/could not reach the server/i)).first()).toBeVisible();
    await context.setOffline(false);
    await app.page.locator('main#main ul.stagger > li').first().getByRole('button', { name: /Add .* to favorites/ }).click();
    await expect(app.page.locator('main#main ul.stagger > li').first().getByRole('button', { name: /Remove .* from favorites/ })).toBeVisible();
  });
});

test.describe('security headers and CORS', () => {
  test('the API sends hardening headers and hides its framework', async ({ request }) => {
    const response = await request.get(`${API}/health`);
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['x-powered-by'], 'do not advertise Express').toBeUndefined();
  });

  test('a browser preflight from another site is answered, so the app can call the API', async ({ request }) => {
    const response = await request.fetch(`${API}/tracks`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://my-app.vercel.app', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' },
    });
    expect(response.status()).toBe(204);
    expect(response.headers()['access-control-allow-origin']).toBeTruthy();
    expect(response.headers()['access-control-allow-headers']).toMatch(/authorization/i);
  });
});

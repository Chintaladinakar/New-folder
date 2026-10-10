import type { Page } from '@playwright/test';
import { API, PASSWORD, SESSION_KEY, apiLogin, apiToken, createListener, expect, nav, open, playRow, resetBackend, row, seedTrack, signIn, test } from './helpers';

const UNAUTHORIZED = [/status of 401/, /status of 429/];

/** The sign-in screen is the listeners'; the admin's password form lives at /admin and nowhere else. */
const ADMIN_SIGN_IN = '/admin';
const pinField = (page: Page) => page.getByLabel('PIN', { exact: true });

test.describe('signed out', () => {
  test.use({ allowedErrors: { patterns: UNAUTHORIZED } });

  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

  test('shows the sign-in screen, focused and ready, with no way in for the admin', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByLabel('Username')).toBeFocused();
    await expect(pinField(page)).toHaveAttribute('inputmode', 'numeric');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    // The admin's sign-in is neither offered nor mentioned here.
    await expect(page.getByLabel('Password')).toHaveCount(0);
    await expect(page.getByText(/admin/i)).toHaveCount(0);
  });

  test("the admin's sign-in is at /admin, focused and ready", async ({ page }) => {
    await page.goto(ADMIN_SIGN_IN);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    const password = page.getByLabel('Password');
    await expect(password).toBeFocused();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(page.getByLabel('Username')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    // Someone who came here by mistake can get to the listeners' sign-in.
    await page.getByRole('link', { name: 'Sign in with a username and PIN instead' }).click();
    await expect(page.getByLabel('Username')).toBeFocused();
  });

  test('any deep link asks you to sign in first, then lands where you were going', async ({ page, request }) => {
    await createListener(request, await apiToken(request), 'asha', '482913');
    await page.goto('/playlists');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.getByLabel('Username').fill('asha');
    await pinField(page).fill('482913');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/playlists$/);
    await expect(page.getByRole('heading', { name: 'Playlists', level: 1 })).toBeVisible();
  });

  test('a wrong password shows an error and clears the field', async ({ page }) => {
    await page.goto(ADMIN_SIGN_IN);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Incorrect password');
    await expect(page.getByLabel('Password')).toHaveValue('');
    await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  test('the Enter key submits', async ({ page }) => {
    await page.goto(ADMIN_SIGN_IN);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByLabel('Password').press('Enter');
    await expect(page.locator('main#main')).toBeVisible();
  });

  test('a correct password opens the accounts page, and the session survives a reload', async ({ page }) => {
    await page.goto(ADMIN_SIGN_IN);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Accounts', level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.locator('main#main')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toHaveCount(0);
  });

  test('hostile passwords are rejected cleanly, never a server error', async ({ page, request }) => {
    for (const password of ["' OR '1'='1", '"; DROP TABLE tracks; --', '<script>alert(1)</script>', '\u0000', 'ñ'.repeat(500), ' ']) {
      const response = await request.post(`${API}/auth/login`, { data: { password } });
      expect([400, 401], `password ${JSON.stringify(password).slice(0, 30)}`).toContain(response.status());
    }
    // Too long: the API caps it, and the message is readable.
    const tooLong = await request.post(`${API}/auth/login`, { data: { password: 'x'.repeat(1001) } });
    expect(tooLong.status()).toBe(400);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('wrong guesses are rate-limited with a clear message', async ({ page, request }) => {
    for (let i = 0; i < 10; i += 1) await request.post(`${API}/auth/login`, { data: { password: 'nope' } });
    await page.goto(ADMIN_SIGN_IN);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText(/too many/i);
    // Even the right password is refused while limited.
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('a session that has expired is not accepted', async ({ page, request }) => {
    const token = await apiToken(request);
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [SESSION_KEY, JSON.stringify({ token, expiresAt: new Date(Date.now() - 1000).toISOString() })],
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('a forged session is thrown out on the first request', async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [SESSION_KEY, JSON.stringify({ token: 'forged.token', expiresAt: new Date(Date.now() + 3600_000).toISOString() })],
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
  });

  test('corrupt stored data does not break the app', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('mp3-player:session', '{not json');
      localStorage.setItem('mp3-player:settings', '[[[[');
      localStorage.setItem('mp3-player:player', 'null');
      localStorage.setItem('mp3-player:resume', '42');
      localStorage.setItem('mp3-player:last-sign-in', '{"mode":');
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });
});

test.describe('listeners', () => {
  test.use({ allowedErrors: { patterns: UNAUTHORIZED } });

  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
    await createListener(request, await apiToken(request), 'asha', '482913', 'Asha');
  });

  test('sign in with a username and PIN, and the next visit remembers who', async ({ page }) => {
    await page.goto('/');
    // Usernames don't care about case.
    await page.getByLabel('Username').fill('Asha');
    await pinField(page).fill('482913');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('main#main')).toBeVisible();

    await page.getByRole('button', { name: 'Account' }).click();
    await expect(page.getByRole('menu')).toContainText('Asha');
    await expect(page.getByRole('menuitem', { name: 'Accounts' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Sign out' }).click();

    // Back at sign-in, the username is filled in and the PIN is next.
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByLabel('Username')).toHaveValue('asha');
    await expect(pinField(page)).toBeFocused();
  });

  test('a wrong PIN gets the same answer as an unknown name, and five in a row lock the account', async ({ page, request }) => {
    await page.goto('/');
    await page.getByLabel('Username').fill('asha');
    await pinField(page).fill('000000');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Incorrect username or PIN');
    await expect(pinField(page)).toHaveValue('');
    await expect(pinField(page)).toBeFocused();

    await page.getByLabel('Username').fill('nobody');
    await pinField(page).fill('482913');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Incorrect username or PIN');

    // Four more wrong PINs make five: now even the right one has to wait.
    for (let i = 0; i < 4; i += 1) await request.post(`${API}/auth/pin`, { data: { username: 'asha', pin: '111112' } });
    await page.getByLabel('Username').fill('asha');
    await pinField(page).fill('482913');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText(/too many wrong pins/i);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('a listener can play anything but change nothing', async ({ page, request }) => {
    await seedTrack(request, await apiToken(request), { title: 'Shared Song', artist: 'Juniper', seconds: 4 });
    const { token, user } = await apiLogin(request, { username: 'asha', pin: '482913' });
    await signIn(page, token, user);
    await open(page, '/library');

    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await row(page, 'Shared Song').getByRole('button', { name: 'More options for Shared Song' }).click();
    await expect(page.getByRole('menuitem', { name: 'Start radio' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Edit details' })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Delete from library' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await playRow(page, 'Shared Song');

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Only the admin can see this' })).toBeVisible();

    // The API refuses as well, whatever a page shows.
    const headers = { Authorization: `Bearer ${token}` };
    expect((await request.post(`${API}/tracks/upload-url`, { headers, data: { fileName: 'x.wav', fileSize: 10 } })).status()).toBe(403);
    expect((await request.get(`${API}/admin/users`, { headers })).status()).toBe(403);
  });
});

test.describe('signed in', () => {
  test.use({ allowedErrors: { patterns: UNAUTHORIZED } });

  test('signing out from the account menu returns to sign-in and clears the session', async ({ app }) => {
    await open(app.page, '/');
    await app.page.getByRole('button', { name: 'Account' }).click();
    await app.page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(app.page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(await app.page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
    // The admin is taken to their own sign-in page.
    await expect(app.page).toHaveURL(/\/admin$/);
    await app.page.reload();
    await expect(app.page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(app.page.getByLabel('Password')).toBeVisible();
  });

  test('a session revoked mid-use sends you back to sign-in', async ({ app }) => {
    await open(app.page, '/');
    // The token stops being valid (as if the password was changed on the server).
    await app.page.evaluate((key) => {
      const session = JSON.parse(localStorage.getItem(key) ?? '{}');
      localStorage.setItem(key, JSON.stringify({ ...session, token: 'x.y' }));
    }, SESSION_KEY);
    await app.page.reload();
    await expect(app.page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('signing out stops playback and forgets the queue', async ({ app, request }) => {
    await seedTrack(request, app.token, { title: 'Private Song', seconds: 4 });
    await open(app.page, '/library');
    await app.page.locator('main#main li').filter({ hasText: 'Private Song' }).click();
    await expect.poll(() => app.page.evaluate(() => (window as unknown as { __audios: HTMLAudioElement[] }).__audios[0]?.paused)).toBe(false);
    await app.page.getByRole('button', { name: 'Account' }).click();
    await app.page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(app.page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect.poll(() => app.page.evaluate(() => (window as unknown as { __audios: HTMLAudioElement[] }).__audios[0]?.paused)).toBe(true);
    // Signing back in does not bring the previous queue back.
    await app.page.getByLabel('Password').fill(PASSWORD);
    await app.page.getByRole('button', { name: 'Sign in' }).click();
    await expect(nav(app.page, 'Home')).toBeVisible();
    await expect(app.page.getByRole('complementary', { name: 'Now playing' })).toHaveCount(0);
  });
});

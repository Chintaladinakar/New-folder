import { API, createListener, expect, expectPlaying, open, seedLibrary, test } from './helpers';

test.describe('accounts', () => {
  test('the admin makes a listener account and hands over the PIN', async ({ app, request, expectErrors }) => {
    await open(app.page, '/admin');
    await expect(app.page.getByRole('heading', { name: 'Accounts', level: 1 })).toBeVisible();
    await expect(app.page.getByText('No listeners yet')).toBeVisible();

    await app.page.getByRole('button', { name: 'New account' }).first().click();
    const dialog = app.page.getByRole('dialog', { name: 'New account' });
    await dialog.getByLabel('Name', { exact: true }).fill('Asha Rao');
    // The username follows the name until it's typed by hand.
    await expect(dialog.getByLabel('Username')).toHaveValue('asha.rao');
    await dialog.getByRole('button', { name: "I'll choose" }).click();
    await dialog.getByLabel('Their PIN').fill('123456');
    await dialog.getByRole('button', { name: 'Create account' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Too easy to guess');
    await dialog.getByLabel('Their PIN').fill('482913');
    await dialog.getByRole('button', { name: 'Create account' }).click();

    const reveal = app.page.getByRole('dialog', { name: 'Asha Rao can sign in now' });
    await expect(reveal).toContainText('asha.rao');
    await expect(reveal).toContainText('482 913');
    await reveal.getByRole('button', { name: 'Done' }).click();

    const asha = app.page.locator('main#main li').filter({ hasText: '@asha.rao' });
    await expect(asha).toContainText('Asha Rao');
    await expect(asha).toContainText('Active');
    await expect(asha).toContainText('Never signed in');
    expect((await request.post(`${API}/auth/pin`, { data: { username: 'asha.rao', pin: '482913' } })).ok()).toBe(true);

    // A username can only be used once.
    expectErrors(/status of 409/);
    await app.page.getByRole('button', { name: 'New account' }).first().click();
    await dialog.getByLabel('Username').fill('asha.rao');
    await dialog.getByRole('button', { name: 'Create account' }).click();
    await expect(dialog.getByRole('alert')).toContainText('is taken');
  });

  test('resetting a PIN, turning an account off, and deleting it', async ({ app, request }) => {
    await createListener(request, app.token, 'ravi', '482913', 'Ravi');
    await open(app.page, '/admin');
    const ravi = app.page.locator('main#main li').filter({ hasText: '@ravi' });
    const options = () => ravi.getByRole('button', { name: 'Options for Ravi' }).click();

    // A new PIN; the old one stops working.
    await options();
    await app.page.getByRole('menuitem', { name: 'Reset PIN' }).click();
    await app.page.getByRole('dialog', { name: "Reset Ravi's PIN?" }).getByRole('button', { name: 'Reset PIN' }).click();
    const reveal = app.page.getByRole('dialog', { name: "Ravi's new PIN" });
    const pin = ((await reveal.locator('dd').nth(1).textContent()) ?? '').replace(/\s/g, '');
    expect(pin).toMatch(/^\d{6}$/);
    await reveal.getByRole('button', { name: 'Done' }).click();
    expect((await request.post(`${API}/auth/pin`, { data: { username: 'ravi', pin: '482913' } })).status()).toBe(401);
    expect((await request.post(`${API}/auth/pin`, { data: { username: 'ravi', pin } })).ok()).toBe(true);

    // Turned off: the right PIN no longer gets in.
    await options();
    await app.page.getByRole('menuitem', { name: 'Turn account off' }).click();
    await expect(ravi).toContainText('Turned off');
    expect((await request.post(`${API}/auth/pin`, { data: { username: 'ravi', pin } })).status()).toBe(403);

    await options();
    await app.page.getByRole('menuitem', { name: 'Delete account' }).click();
    await app.page.getByRole('dialog', { name: 'Delete this account?' }).getByRole('button', { name: 'Delete account' }).click();
    await expect(ravi).toHaveCount(0);
    await expect(app.page.getByText('No listeners yet')).toBeVisible();
  });

  test('Home makes mixes from what the account plays', async ({ app, request }) => {
    const tracks = await seedLibrary(request, app.token);
    const headers = { Authorization: `Bearer ${app.token}` };
    // Every track played through three times.
    for (let round = 0; round < 3; round += 1) {
      for (const track of tracks) {
        const { playId } = await (await request.post(`${API}/tracks/${track.id}/play`, { headers })).json();
        await request.post(`${API}/plays/${playId}/finish`, { headers, data: { listenedSeconds: 3, completed: true } });
      }
    }

    await open(app.page, '/');
    const mix = app.page.getByRole('link', { name: /^On Repeat/ });
    await expect(mix).toBeVisible();
    await mix.click();
    await expect(app.page).toHaveURL(/\/mix\/on-repeat$/);
    await expect(app.page.getByRole('heading', { name: 'On Repeat', level: 1 })).toBeVisible();
    await app.page.getByRole('button', { name: 'Play', exact: true }).click();
    await expectPlaying(app.page);
  });
});

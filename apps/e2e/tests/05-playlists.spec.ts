import type { Page } from '@playwright/test';
import { API, expect, open, row, seedLibrary, seedTrack, test, trackRows } from './helpers';

const rowTitles = (page: Page) =>
  page.locator('main#main ul.stagger > li').evaluateAll((items) => items.map((item) => (item.querySelector('.truncate')?.textContent ?? '').trim()));

async function createPlaylist(page: Page, name: string, description?: string) {
  const tile = page.getByRole('button', { name: /^New playlist/ }).first();
  await tile.click();
  const dialog = page.getByRole('dialog', { name: 'New playlist' });
  await dialog.getByLabel('Name').fill(name);
  if (description) await dialog.getByLabel('Description (optional)').fill(description);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/playlists\/[0-9a-f-]{36}$/);
}

async function addToPlaylist(page: Page, trackTitle: string, playlistName: string) {
  await row(page, trackTitle).getByRole('button', { name: /More options for/ }).click();
  await page.getByRole('menuitem', { name: 'Add to playlist…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to playlist' });
  await dialog.getByRole('button', { name: new RegExp(playlistName) }).click();
  await expect(dialog).toBeHidden();
}

test.describe('playlists', () => {
  test('starts empty, with a clear first step', async ({ app }) => {
    await open(app.page, '/playlists');
    await expect(app.page.getByRole('heading', { name: 'No playlists yet' })).toBeVisible();
  });

  test('create a playlist, and land on it', async ({ app }) => {
    await open(app.page, '/playlists');
    await createPlaylist(app.page, 'Road Trip', 'Long drives');
    await expect(app.page.getByRole('heading', { name: 'Road Trip', level: 1 })).toBeVisible();
    await expect(app.page.getByText('Long drives')).toBeVisible();
    await expect(app.page.getByRole('heading', { name: 'This playlist is empty' })).toBeVisible();
  });

  test('a blank or whitespace-only name cannot be created', async ({ app }) => {
    await open(app.page, '/playlists');
    await app.page.getByRole('button', { name: /^New playlist/ }).first().click();
    const dialog = app.page.getByRole('dialog', { name: 'New playlist' });
    await expect(dialog.getByRole('button', { name: 'Create' })).toBeDisabled();
    await dialog.getByLabel('Name').fill('     ');
    await expect(dialog.getByRole('button', { name: 'Create' })).toBeDisabled();
    await dialog.getByLabel('Name').fill('x'.repeat(250));
    expect((await dialog.getByLabel('Name').inputValue()).length, 'the field caps at 200').toBe(200);
  });

  test('add tracks from the library, in order, and see them in the playlist', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/playlists');
    await createPlaylist(app.page, 'Mix');
    await open(app.page, '/library');
    await addToPlaylist(app.page, 'Neon Streets', 'Mix');
    await expect(app.page.getByText('Added 1 track to Mix')).toBeVisible();
    await addToPlaylist(app.page, 'Paper Planes', 'Mix');
    await open(app.page, '/playlists');
    await app.page.getByRole('link', { name: /Mix/ }).click();
    await expect.poll(() => rowTitles(app.page)).toEqual(['Neon Streets', 'Paper Planes']);
    await expect(app.page.getByText('2 tracks')).toBeVisible();
  });

  test('create a playlist straight from the "add to playlist" dialog', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await row(app.page, 'Slow Tide').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Add to playlist…' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Add to playlist' });
    await dialog.getByLabel('New playlist name').fill('Fresh Start');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden();
    await open(app.page, '/playlists');
    await expect(app.page.getByRole('link', { name: /Fresh Start/ })).toContainText('1 track');
  });

  test('the same track can be in a playlist twice', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/playlists');
    await createPlaylist(app.page, 'Repeats');
    await open(app.page, '/library');
    await addToPlaylist(app.page, 'Slow Tide', 'Repeats');
    await addToPlaylist(app.page, 'Slow Tide', 'Repeats');
    await open(app.page, '/playlists');
    await app.page.getByRole('link', { name: /Repeats/ }).click();
    await expect(trackRows(app.page)).toHaveCount(2);
  });

  test('reorder with Move up and Move down, and the order sticks after a reload', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/playlists');
    await createPlaylist(app.page, 'Ordered');
    await open(app.page, '/library?sort=title');
    for (const title of ['Midnight Drive', 'Morning Light', 'Neon Streets']) await addToPlaylist(app.page, title, 'Ordered');
    await open(app.page, '/playlists');
    await app.page.getByRole('link', { name: /Ordered/ }).click();
    await expect.poll(() => rowTitles(app.page)).toEqual(['Midnight Drive', 'Morning Light', 'Neon Streets']);

    await row(app.page, 'Neon Streets').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Move up' }).click();
    await expect.poll(() => rowTitles(app.page)).toEqual(['Midnight Drive', 'Neon Streets', 'Morning Light']);

    await row(app.page, 'Midnight Drive').getByRole('button', { name: /More options for/ }).click();
    await expect(app.page.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
    await app.page.getByRole('menuitem', { name: 'Move down' }).click();
    await expect.poll(() => rowTitles(app.page)).toEqual(['Neon Streets', 'Midnight Drive', 'Morning Light']);

    await app.page.reload();
    await expect.poll(() => rowTitles(app.page)).toEqual(['Neon Streets', 'Midnight Drive', 'Morning Light']);
    await row(app.page, 'Morning Light').getByRole('button', { name: /More options for/ }).click();
    await expect(app.page.getByRole('menuitem', { name: 'Move down' })).toBeDisabled();
  });

  test('remove one track from a playlist without deleting it from the library', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/playlists');
    await createPlaylist(app.page, 'Trim');
    await open(app.page, '/library');
    await addToPlaylist(app.page, 'Neon Streets', 'Trim');
    await addToPlaylist(app.page, 'Paper Planes', 'Trim');
    await open(app.page, '/playlists');
    await app.page.getByRole('link', { name: /Trim/ }).click();
    await row(app.page, 'Neon Streets').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Remove from this playlist' }).click();
    await expect.poll(() => rowTitles(app.page)).toEqual(['Paper Planes']);
    await open(app.page, '/library');
    await expect(row(app.page, 'Neon Streets')).toBeVisible();
  });

  test('rename and re-describe a playlist', async ({ app }) => {
    await open(app.page, '/playlists');
    await createPlaylist(app.page, 'Old Name');
    await app.page.getByRole('button', { name: 'Playlist options' }).click();
    await app.page.getByRole('menuitem', { name: 'Edit details' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Edit playlist' });
    await dialog.getByLabel('Name').fill('New Name');
    await dialog.getByLabel('Description (optional)').fill('Now with words');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(app.page.getByRole('heading', { name: 'New Name', level: 1 })).toBeVisible();
    await expect(app.page.getByText('Now with words')).toBeVisible();
  });

  test('delete asks first; the tracks stay in the library', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/playlists');
    await createPlaylist(app.page, 'Doomed');
    await open(app.page, '/library');
    await addToPlaylist(app.page, 'Slow Tide', 'Doomed');
    await open(app.page, '/playlists');
    await app.page.getByRole('link', { name: /Doomed/ }).click();

    await app.page.getByRole('button', { name: 'Playlist options' }).click();
    await app.page.getByRole('menuitem', { name: 'Delete playlist' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Delete playlist?' });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(app.page.getByRole('heading', { name: 'Doomed', level: 1 })).toBeVisible();

    await app.page.getByRole('button', { name: 'Playlist options' }).click();
    await app.page.getByRole('menuitem', { name: 'Delete playlist' }).click();
    await app.page.getByRole('dialog').getByRole('button', { name: 'Delete playlist' }).click();
    await expect(app.page).toHaveURL(/\/playlists$/);
    await expect(app.page.getByRole('heading', { name: 'No playlists yet' })).toBeVisible();
    await open(app.page, '/library');
    await expect(row(app.page, 'Slow Tide')).toBeVisible();
  });

  test('deleting a track from the library removes it from playlists too', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/playlists');
    await createPlaylist(app.page, 'Shrinks');
    await open(app.page, '/library');
    await addToPlaylist(app.page, 'Slow Tide', 'Shrinks');
    await addToPlaylist(app.page, 'Paper Planes', 'Shrinks');
    await row(app.page, 'Slow Tide').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Delete from library' }).click();
    await app.page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await open(app.page, '/playlists');
    await expect(app.page.getByRole('link', { name: /Shrinks/ })).toContainText('1 track');
  });

  test('playing a playlist plays its tracks in its order', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/playlists');
    await createPlaylist(app.page, 'Play Me');
    await open(app.page, '/library?sort=title');
    await addToPlaylist(app.page, 'Slow Tide', 'Play Me');
    await addToPlaylist(app.page, 'Morning Light', 'Play Me');
    await open(app.page, '/playlists');
    await app.page.getByRole('link', { name: /Play Me/ }).click();
    await app.page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect.poll(() => app.page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('Slow Tide');
  });

  test('a playlist name with HTML or emoji is shown as plain text', async ({ app }) => {
    await open(app.page, '/playlists');
    await createPlaylist(app.page, '<b onmouseover="window.__x=1">Bold</b> 🎵');
    await expect(app.page.getByRole('heading', { level: 1 })).toContainText('<b onmouseover');
    expect(await app.page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
  });

  test('an unknown playlist link is a friendly dead end', async ({ app, expectErrors }) => {
    expectErrors(/status of 404/);
    await open(app.page, '/playlists/00000000-0000-4000-8000-000000000000');
    await expect(app.page.getByText(/not found/i)).toBeVisible();
    await app.page.getByRole('link', { name: 'Back to playlists' }).click();
    await expect(app.page).toHaveURL(/\/playlists$/);
  });

  test('a malformed playlist link is a friendly dead end too', async ({ app, expectErrors }) => {
    expectErrors(/status of 404/);
    await open(app.page, '/playlists/not-a-uuid');
    await expect(app.page.getByText(/not found/i)).toBeVisible();
  });

  test('the playlist API refuses bad input without a server error', async ({ app, request }) => {
    const headers = { Authorization: `Bearer ${app.token}` };
    const track = await seedTrack(request, app.token, { title: 'Anchor' });
    const created = await (await request.post(`${API}/playlists`, { headers, data: { name: 'API' } })).json();
    const id = created.playlist.id;
    const cases: [string, () => Promise<{ status(): number }>][] = [
      ['empty body', () => request.post(`${API}/playlists`, { headers, data: {} })],
      ['name too long', () => request.post(`${API}/playlists`, { headers, data: { name: 'x'.repeat(201) } })],
      ['null byte in name', () => request.post(`${API}/playlists`, { headers, data: { name: 'a\u0000b' } })],
      ['unknown track id', () => request.post(`${API}/playlists/${id}/tracks`, { headers, data: { trackIds: ['00000000-0000-4000-8000-000000000000'] } })],
      ['non-uuid track id', () => request.post(`${API}/playlists/${id}/tracks`, { headers, data: { trackIds: ['nope'] } })],
      ['empty track list', () => request.post(`${API}/playlists/${id}/tracks`, { headers, data: { trackIds: [] } })],
      ['1001 tracks', () => request.post(`${API}/playlists/${id}/tracks`, { headers, data: { trackIds: Array(1001).fill(track.id) } })],
      ['reorder with a stranger', () => request.put(`${API}/playlists/${id}/order`, { headers, data: { entryIds: ['00000000-0000-4000-8000-000000000000'] } })],
      ['reorder not a list', () => request.put(`${API}/playlists/${id}/order`, { headers, data: { entryIds: 'x' } })],
      ['remove unknown entry', () => request.delete(`${API}/playlists/${id}/tracks/00000000-0000-4000-8000-000000000000`, { headers })],
      ['patch with extra field', () => request.patch(`${API}/playlists/${id}`, { headers, data: { name: 'ok', id: 'hack' } })],
    ];
    for (const [name, call] of cases) {
      const status = (await call()).status();
      expect(status, `${name} → ${status}`).toBeLessThan(500);
      expect(status, `${name} must be refused or ignored, got ${status}`).not.toBe(201);
    }
  });
});

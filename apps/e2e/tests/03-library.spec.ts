import { API, expect, horizontalOverflow, nav, open, row, seedLibrary, seedTrack, test } from './helpers';

const rowTitles = (page: import('@playwright/test').Page) =>
  page.locator('main#main ul.stagger > li').evaluateAll((items) => items.map((item) => (item.querySelector('.truncate')?.textContent ?? '').trim()));

test.describe('library: browsing', () => {
  test('lists every track with its tags', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await expect(app.page.getByRole('heading', { name: 'Songs', level: 1 })).toBeVisible();
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(6);
    await expect(row(app.page, 'Morning Light')).toContainText('Aurora Vale');
    await expect(row(app.page, 'No Tags Here')).toBeVisible();
  });

  test('an empty library says so and offers upload', async ({ app }) => {
    await open(app.page, '/library');
    await expect(app.page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();
    await expect(app.page.locator('input[type="file"]').first()).toBeAttached();
  });

  test('the songs tabs move between all, favorites, recent and played', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    const tabs = app.page.getByRole('navigation', { name: 'Songs' });
    await tabs.getByRole('link', { name: 'Favorites' }).click();
    await expect(app.page).toHaveURL(/favorites/);
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(1);
    await expect(row(app.page, 'Paper Planes')).toBeVisible();
    await tabs.getByRole('link', { name: 'Recently played' }).click();
    await expect(app.page.getByRole('heading', { name: 'Nothing played yet' })).toBeVisible();
    await tabs.getByRole('link', { name: 'Recently added' }).click();
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(6);
    await tabs.getByRole('link', { name: 'All songs' }).click();
    await expect(tabs.getByRole('link', { name: 'All songs' })).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('library: search', () => {
  test('typing in the search box filters, updates the URL, and clears', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    const search = app.page.getByRole('searchbox', { name: 'Search your library' });
    await search.fill('night');
    await expect(app.page).toHaveURL(/q=night/);
    await expect.poll(() => rowTitles(app.page)).toEqual(expect.arrayContaining(['Neon Streets', 'Midnight Drive']));
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(2);
    await app.page.getByRole('button', { name: 'Clear search' }).click();
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(6);
    await expect(app.page).not.toHaveURL(/q=/);
  });

  test('search works from any page and lands on the results', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/albums');
    await app.page.getByRole('searchbox', { name: 'Search your library' }).fill('juniper');
    await expect(app.page).toHaveURL(/\/library\?q=juniper/);
    await expect(row(app.page, 'Paper Planes')).toBeVisible();
  });

  test('a search with no results says so', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library?q=zzzzzz');
    await expect(app.page.getByRole('heading', { name: 'No matches' })).toBeVisible();
  });

  test('a search link in the URL is respected on load and survives reload', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library?q=owls');
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(2);
    await app.page.reload();
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(2);
    await expect(app.page.getByRole('searchbox', { name: 'Search your library' })).toHaveValue('owls');
  });

  test('wildcards and odd characters are searched literally, not as patterns', async ({ app, request }) => {
    await seedTrack(request, app.token, { title: '100% Pure' });
    await seedTrack(request, app.token, { title: 'Plain Song' });
    await seedTrack(request, app.token, { title: 'Under_score' });
    await seedTrack(request, app.token, { title: 'Quote "Song" \'x\'' });
    const count = async (query: string) => {
      await open(app.page, `/library?q=${encodeURIComponent(query)}`);
      await expect(app.page.locator('main#main')).toBeVisible();
      await app.page.waitForTimeout(400);
      return app.page.locator('main#main ul.stagger > li').count();
    };
    expect(await count('%'), '% matches only the title containing a percent sign').toBe(1);
    expect(await count('_'), '_ matches only the title containing an underscore').toBe(1);
    expect(await count('\\'), 'a backslash matches nothing').toBe(0);
    expect(await count('"Song"')).toBe(1);
    expect(await count("' OR 1=1 --"), 'SQL text is just text').toBe(0);
    expect(await count('<script>alert(1)</script>')).toBe(0);
    expect(await count('🎵')).toBe(0);
  });

  test('pressing "/" focuses the search box, and Escape leaves it', async ({ app }) => {
    await open(app.page, '/');
    await app.page.locator('body').press('/');
    await expect(app.page.getByRole('searchbox', { name: 'Search your library' })).toBeFocused();
    await app.page.keyboard.press('Escape');
    await expect(app.page.getByRole('searchbox', { name: 'Search your library' })).not.toBeFocused();
  });
});

test.describe('library: sorting and filtering', () => {
  test.beforeEach(async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
  });

  test('sort by title, reverse it, and the choice lives in the URL', async ({ app }) => {
    await app.page.getByRole('button', { name: 'Sort' }).click();
    await app.page.getByRole('menuitemcheckbox', { name: 'Title' }).click();
    await expect(app.page).toHaveURL(/sort=title/);
    await expect.poll(() => rowTitles(app.page)).toEqual(['Midnight Drive', 'Morning Light', 'Neon Streets', 'No Tags Here', 'Paper Planes', 'Slow Tide']);

    await app.page.getByRole('button', { name: /click to reverse/ }).click();
    await expect(app.page).toHaveURL(/reverse=true/);
    await expect.poll(() => rowTitles(app.page)).toEqual(['Slow Tide', 'Paper Planes', 'No Tags Here', 'Neon Streets', 'Morning Light', 'Midnight Drive']);

    await app.page.reload();
    await expect.poll(() => rowTitles(app.page)).toEqual(['Slow Tide', 'Paper Planes', 'No Tags Here', 'Neon Streets', 'Morning Light', 'Midnight Drive']);
  });

  test('every sort order is accepted and returns every track', async ({ app }) => {
    for (const label of ['Recently added', 'Title', 'Artist', 'Album', 'Year', 'Duration', 'Most played', 'Recently played']) {
      await app.page.getByRole('button', { name: 'Sort' }).click();
      await app.page.getByRole('menuitemcheckbox', { name: label, exact: true }).click();
      await expect(app.page.locator('main#main ul.stagger > li'), `sort: ${label}`).toHaveCount(6);
    }
  });

  test('longest first when sorted by duration', async ({ app }) => {
    await open(app.page, '/library?sort=duration');
    await expect.poll(async () => (await rowTitles(app.page))[0]).toBe('Midnight Drive');
  });

  test('filter by genre, and remove the filter from its chip', async ({ app }) => {
    await app.page.getByRole('button', { name: 'Filters' }).click();
    await app.page.getByRole('button', { name: /^Ambient/ }).click();
    await expect(app.page).toHaveURL(/genre=Ambient/);
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(2);
    await app.page.getByRole('button', { name: 'Remove genre filter' }).click();
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(6);
  });

  test('filter by decade and by format, then clear all', async ({ app }) => {
    await app.page.getByRole('button', { name: 'Filters' }).click();
    await app.page.getByRole('button', { name: '1980s' }).click();
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(2);
    await app.page.getByRole('button', { name: /^WAV/ }).click();
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(2);
    await app.page.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(6);
  });

  test('filters that match nothing show a helpful empty state, not a blank page', async ({ app }) => {
    await open(app.page, '/library?genre=Ambient&yearFrom=1980&yearTo=1989');
    await expect(app.page.getByRole('heading', { name: 'No matches' })).toBeVisible();
  });

  test('the favorites chip narrows to favorites', async ({ app }) => {
    await app.page.getByRole('button', { name: 'Favorites', exact: true }).click();
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(1);
  });

  test('nonsense in the URL is ignored, not crashed on', async ({ app, expectErrors }) => {
    // A bad request may be refused with 400; it must never be a 500.
    expectErrors(/status of 400/);
    for (const query of ['sort=bogus', 'yearFrom=abc', 'yearFrom=-5&yearTo=99999', 'limit=99999', 'genre=%00', 'reverse=maybe', 'q=%E0%A4%A']) {
      await open(app.page, `/library?${query}`);
      await expect(app.page.locator('main#main')).toBeVisible();
      await expect(app.page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});

test.describe('library: editing', () => {
  test('favorite from the row, and it shows in Favorites', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await row(app.page, 'Neon Streets').getByRole('button', { name: /Add Neon Streets to favorites/ }).click();
    await expect(row(app.page, 'Neon Streets').getByRole('button', { name: /Remove Neon Streets from favorites/ })).toHaveAttribute('aria-pressed', 'true');
    await open(app.page, '/favorites');
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(2);
  });

  test('edit details: change, save, and the list updates', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await row(app.page, 'No Tags Here').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Edit details' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Edit details' });
    await dialog.getByLabel('Title', { exact: true }).fill('Now It Has Tags');
    await dialog.getByLabel('Artist', { exact: true }).fill('Fixed Artist');
    await dialog.getByLabel('Year').fill('1999');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(row(app.page, 'Now It Has Tags')).toContainText('Fixed Artist');
    await expect(row(app.page, 'No Tags Here')).toHaveCount(0);
  });

  test('edit details cannot blank the title', async ({ app, request }) => {
    await seedTrack(request, app.token, { title: 'Keep My Title' });
    await open(app.page, '/library');
    await row(app.page, 'Keep My Title').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Edit details' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Edit details' });
    await dialog.getByLabel('Title', { exact: true }).fill('   ');
    // Saving is not offered for a blank title (the form never sends it to the server).
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
    await dialog.getByLabel('Title', { exact: true }).fill('A real title');
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeEnabled();
    await app.page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(row(app.page, 'Keep My Title')).toBeVisible();
  });

  test('Escape closes a dialog and focus returns to where it was', async ({ app, request }) => {
    await seedTrack(request, app.token, { title: 'Focus Song' });
    await open(app.page, '/library');
    const trigger = row(app.page, 'Focus Song').getByRole('button', { name: /More options for/ });
    await trigger.click();
    await app.page.getByRole('menuitem', { name: 'Edit details' }).click();
    await expect(app.page.getByRole('dialog')).toBeVisible();
    await app.page.keyboard.press('Escape');
    await expect(app.page.getByRole('dialog')).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('delete asks first, can be cancelled, and then removes the track', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await row(app.page, 'Paper Planes').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Delete from library' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Delete from library?' });
    await expect(dialog).toContainText('Paper Planes');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(row(app.page, 'Paper Planes')).toBeVisible();

    await row(app.page, 'Paper Planes').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Delete from library' }).click();
    await app.page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(row(app.page, 'Paper Planes')).toHaveCount(0);
    await expect(app.page.getByText('Deleted "Paper Planes"')).toBeVisible();
    // Gone from the server too, and its file with it.
    const list = await (await request.get(`${API}/tracks`, { headers: { Authorization: `Bearer ${app.token}` } })).json();
    expect(list.total).toBe(5);
  });

  test('row menu: queue actions confirm with a toast, and artist/album links navigate', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await row(app.page, 'Morning Light').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Add to queue' }).click();
    await expect(app.page.getByText('Added "Morning Light" to the queue')).toBeVisible();

    await row(app.page, 'Morning Light').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Go to album' }).click();
    await expect(app.page).toHaveURL(/album=Daybreak/);
    await expect(app.page.getByRole('heading', { name: 'Daybreak', level: 1 })).toBeVisible();

    await row(app.page, 'Slow Tide').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Go to artist' }).click();
    await expect(app.page).toHaveURL(/artist=Aurora/);
  });

  test('a track with no artist or album disables those menu links', async ({ app, request }) => {
    await seedTrack(request, app.token, { title: 'Lonely Track' });
    await open(app.page, '/library');
    await row(app.page, 'Lonely Track').getByRole('button', { name: /More options for/ }).click();
    await expect(app.page.getByRole('menuitem', { name: 'Go to artist' })).toBeDisabled();
    await expect(app.page.getByRole('menuitem', { name: 'Go to album' })).toBeDisabled();
  });

  test('the row menu is reachable and operable by keyboard alone', async ({ app, request }) => {
    await seedTrack(request, app.token, { title: 'Keyboard Song' });
    await open(app.page, '/library');
    const trigger = row(app.page, 'Keyboard Song').getByRole('button', { name: /More options for/ });
    await trigger.focus();
    await app.page.keyboard.press('Enter');
    await expect(app.page.getByRole('menu')).toBeVisible();
    await expect(app.page.getByRole('menuitem').first()).toBeFocused();
    await app.page.keyboard.press('ArrowDown');
    await app.page.keyboard.press('Escape');
    await expect(app.page.getByRole('menu')).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('library: albums and artists', () => {
  test('albums list, filter, and open an album in track order', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/albums');
    await expect(app.page.getByRole('link', { name: /Daybreak/ })).toBeVisible();
    await expect(app.page.getByRole('link', { name: /After Hours/ })).toBeVisible();
    await app.page.getByRole('searchbox', { name: 'Filter albums' }).or(app.page.getByPlaceholder('Filter albums')).first().fill('day');
    await expect(app.page.getByRole('link', { name: /After Hours/ })).toHaveCount(0);
    await app.page.getByRole('link', { name: /Daybreak/ }).click();
    await expect(app.page.getByRole('heading', { name: 'Daybreak', level: 1 })).toBeVisible();
    await expect.poll(() => rowTitles(app.page)).toEqual(['Morning Light', 'Slow Tide']);
  });

  test('artists list, and open one', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/artists');
    await app.page.getByRole('link', { name: /The Night Owls/ }).click();
    await expect(app.page.getByRole('heading', { name: 'The Night Owls', level: 1 })).toBeVisible();
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(2);
  });

  test('empty albums and artists pages explain themselves', async ({ app }) => {
    await open(app.page, '/albums');
    await expect(app.page.getByRole('heading', { name: 'No albums yet' })).toBeVisible();
    await nav(app.page, 'Artists').click();
    await expect(app.page.getByRole('heading', { name: 'No artists yet' })).toBeVisible();
  });
});

test.describe('library: scale and hostile content', () => {
  test('more than a page of tracks loads in pages as you scroll', async ({ app, request }) => {
    test.setTimeout(180_000);
    for (let i = 0; i < 125; i += 1) await seedTrack(request, app.token, { title: `Bulk ${String(i).padStart(3, '0')}`, seconds: 0.2 });
    await open(app.page, '/library?sort=title');
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(100);
    await app.page.locator('main#main').evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await expect(app.page.locator('main#main ul.stagger > li')).toHaveCount(125, { timeout: 15_000 });
    await expect(app.page.getByText('125 tracks')).toBeVisible();
  });

  test('HTML in titles, artists and playlist names is shown as text and never runs', async ({ app, request }) => {
    const nasty = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
    await seedTrack(request, app.token, { title: nasty, artist: '"><svg onload=window.__xss=3>', album: "'; alert(1); //" });
    await open(app.page, '/library');
    await expect(row(app.page, '<img src=x')).toBeVisible();
    await row(app.page, '<img src=x').getByRole('button', { name: /More options for/ }).click();
    await app.page.getByRole('menuitem', { name: 'Add to queue' }).click();
    await app.page.waitForTimeout(600);
    expect(await app.page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await open(app.page, '/albums');
    await expect(app.page.locator('a', { hasText: "'; alert(1); //" }).first()).toBeVisible();
    expect(await app.page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test('very long and unusual names do not break the layout', async ({ app, request }) => {
    const long = 'Supercalifragilistic'.repeat(12);
    await seedTrack(request, app.token, { title: `${long} title`, artist: `${long} artist`, album: `${long} album`, fileName: 'long-names.wav' });
    await seedTrack(request, app.token, { title: 'عنوان عربي طويل جدا للأغنية', artist: 'فنان', album: 'ألبوم' });
    await seedTrack(request, app.token, { title: '🎵🎶🎼 emoji title 🎤', artist: '👩‍🎤', album: '💿' });
    for (const path of ['/library', '/albums', '/artists', '/']) {
      await open(app.page, path);
      await app.page.waitForTimeout(500);
      const overflow = await horizontalOverflow(app.page);
      expect(overflow.pageScrolls, `${path} scrolls sideways: ${JSON.stringify(overflow)}`).toBe(false);
      expect(overflow.offenders, `${path} has elements running off the screen`).toEqual([]);
    }
  });
});

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, horizontalOverflow, isPhoneWidth, nav, open, playRow, seedLibrary, test, viewportWidth } from './helpers';

const PAGES: [name: string, path: string][] = [
  ['Home', '/'],
  ['Songs', '/library'],
  ['Favorites', '/favorites'],
  ['Albums', '/albums'],
  ['An album', '/library?album=Daybreak&albumArtist=Aurora%20Vale'],
  ['Artists', '/artists'],
  ['Playlists', '/playlists'],
  ['Settings', '/settings'],
];

async function setTheme(page: Page, label: RegExp) {
  await page.goto('/settings');
  await page.getByRole('button', { name: label }).click();
}

test.describe('layout at every screen size', () => {
  test('no page scrolls sideways, with a populated library', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    for (const [name, path] of PAGES) {
      await open(app.page, path);
      await app.page.waitForTimeout(700);
      const overflow = await horizontalOverflow(app.page);
      expect(overflow.pageScrolls, `${name} scrolls sideways: ${JSON.stringify(overflow)}`).toBe(false);
      expect(overflow.offenders, `${name}: elements run off the screen`).toEqual([]);
    }
  });

  test('no page scrolls sideways while something is playing', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    for (const [name, path] of [...PAGES, ['Full player', '/now-playing']] as [string, string][]) {
      await app.page.goto(path);
      await expect(app.page.locator('main#main')).toBeVisible();
      await app.page.waitForTimeout(600);
      const overflow = await horizontalOverflow(app.page);
      expect(overflow.pageScrolls, `${name} scrolls sideways: ${JSON.stringify(overflow)}`).toBe(false);
    }
  });

  test('empty states fit too', async ({ app }) => {
    for (const [name, path] of PAGES) {
      await open(app.page, path);
      await app.page.waitForTimeout(500);
      const overflow = await horizontalOverflow(app.page);
      expect(overflow.pageScrolls, `${name} (empty) scrolls sideways: ${JSON.stringify(overflow)}`).toBe(false);
    }
  });

  test('the right navigation shows for the screen: tab bar on phones, top bar elsewhere', async ({ app }) => {
    await open(app.page, '/');
    const phone = isPhoneWidth(app.page);
    const bar = app.page.getByRole('navigation', { name: 'Main' });
    // Exactly one main navigation is visible, and it can reach every section.
    await expect(bar.locator('a:visible')).toHaveCount(5);
    const box = await bar.locator('a:visible').first().boundingBox();
    if (phone) expect(box!.y, 'phone tab bar sits at the bottom').toBeGreaterThan(400);
    else expect(box!.y, 'top navigation sits at the top').toBeLessThan(100);
    for (const label of ['Songs', 'Albums', 'Artists', 'Playlists', 'Home']) {
      await nav(app.page, label).click();
      await expect(nav(app.page, label)).toHaveAttribute('aria-current', 'page');
    }
  });

  test('every control is big enough to hit on a touch screen', async ({ app, request }) => {
    test.skip(!isPhoneWidth(app.page), 'phone only');
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    const small = await app.page.evaluate(() => {
      const failures: string[] = [];
      for (const element of Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role="tab"], [role="switch"], input[type="checkbox"]'))) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden' || element.closest('[aria-hidden="true"]')) continue;
        // Links inside running text are exempt; controls are not.
        if (element.tagName === 'A' && element.closest('p')) continue;
        if (rect.width < 28 || rect.height < 28) {
          failures.push(`${element.tagName.toLowerCase()} "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 30)}" is ${Math.round(rect.width)}x${Math.round(rect.height)}`);
        }
      }
      return failures;
    });
    expect(small, 'controls smaller than 28px').toEqual([]);
  });

  test('the player never hides the last rows of a list', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    await app.page.locator('main#main').evaluate((element) => element.scrollTo(0, element.scrollHeight));
    await app.page.waitForTimeout(400);
    const lastRow = app.page.locator('main#main ul.stagger > li').last();
    const rowBox = (await lastRow.boundingBox())!;
    const covering = await app.page.evaluate(
      ([x, y]) => {
        const element = document.elementFromPoint(x, y) as HTMLElement | null;
        return element?.closest('li') ? 'row' : (element?.closest('[aria-label="Player"], [aria-label="Main"], aside')?.getAttribute('aria-label') ?? element?.tagName ?? 'nothing');
      },
      [rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2],
    );
    expect(covering, 'something is drawn over the last row').toBe('row');
  });

  test('on a wide screen the player lives in the side panel; elsewhere it floats', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    const width = viewportWidth(app.page);
    if (width >= 1280) {
      await expect(app.page.getByRole('complementary', { name: 'Now playing' })).toBeVisible();
      await expect(app.page.getByRole('region', { name: 'Player' })).toHaveCount(0);
    } else {
      await expect(app.page.getByRole('region', { name: 'Player' })).toBeVisible();
      await expect(app.page.getByRole('complementary', { name: 'Now playing' })).toHaveCount(0);
    }
  });

  test('rotating or resizing the window re-lays the page out without breaking playback', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    for (const size of [{ width: 1500, height: 900 }, { width: 700, height: 500 }, { width: 390, height: 780 }, { width: 1100, height: 700 }]) {
      await app.page.setViewportSize(size);
      await app.page.waitForTimeout(300);
      const overflow = await horizontalOverflow(app.page);
      expect(overflow.pageScrolls, `${size.width}x${size.height}: ${JSON.stringify(overflow)}`).toBe(false);
    }
    expect(await app.page.evaluate(() => (window as unknown as { __audios: HTMLAudioElement[] }).__audios[0].paused)).toBe(false);
  });

  test('browser zoom to 200% still works', async ({ app, request }) => {
    test.skip(viewportWidth(app.page) < 1000, 'zoom is checked on the wide layout');
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    // 200% zoom is the same as halving the layout width.
    await app.page.setViewportSize({ width: viewportWidth(app.page) / 2, height: 450 });
    await app.page.waitForTimeout(400);
    const overflow = await horizontalOverflow(app.page);
    expect(overflow.pageScrolls, JSON.stringify(overflow)).toBe(false);
  });
});

test.describe('accessibility', () => {
  const seriousOnly = (violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) =>
    violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes.length} element(s), e.g. ${violation.nodes[0]?.target.join(' ')}`);

  for (const [theme, label] of [['dark', /Dark$/], ['black', /Black$/], ['paper', /Paper$/]] as const) {
    test(`no serious accessibility problems on any page: ${theme} theme`, async ({ app, request }) => {
      test.setTimeout(120_000);
      await seedLibrary(request, app.token);
      await setTheme(app.page, label);
      await open(app.page, '/library');
      await playRow(app.page, 'Morning Light');
      const problems: string[] = [];
      for (const [name, path] of [...PAGES, ['Full player', '/now-playing']] as [string, string][]) {
        await app.page.goto(path);
        await expect(app.page.locator('main#main')).toBeVisible();
        // Let entrance animations finish: contrast is measured on settled colours.
        await app.page.waitForTimeout(900);
        const result = await new AxeBuilder({ page: app.page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        for (const problem of seriousOnly(result.violations)) problems.push(`[${name}] ${problem}`);
      }
      expect(problems).toEqual([]);
    });
  }

  test('the sign-in screens are accessible', async ({ page, request }) => {
    const { resetBackend } = await import('./helpers');
    await resetBackend(request);
    // The listeners' sign-in, and the admin's at /admin.
    for (const path of ['/', '/admin']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
      await page.waitForTimeout(700);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(seriousOnly(result.violations), path).toEqual([]);
    }
  });

  test('dialogs, menus and the queue are accessible while open', async ({ app, request }) => {
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    await playRow(app.page, 'Morning Light');
    const problems: string[] = [];
    const scan = async (name: string) => {
      await app.page.waitForTimeout(500);
      const result = await new AxeBuilder({ page: app.page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      for (const problem of seriousOnly(result.violations)) problems.push(`[${name}] ${problem}`);
    };
    const first = app.page.locator('main#main ul.stagger > li').first();
    await first.getByRole('button', { name: /More options for/ }).click();
    await scan('row menu');
    await app.page.getByRole('menuitem', { name: 'Edit details' }).click();
    await scan('edit dialog');
    await app.page.keyboard.press('Escape');
    await app.page.getByRole('button', { name: 'Filters' }).click();
    await scan('filter panel');
    expect(problems).toEqual([]);
  });

  test('a keyboard user can reach and operate the main controls', async ({ app, request }) => {
    test.skip(isPhoneWidth(app.page), 'keyboard');
    await seedLibrary(request, app.token);
    await open(app.page, '/library');
    // Tab order starts with a "skip to content" link that really skips.
    await app.page.keyboard.press('Tab');
    const skip = app.page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await app.page.keyboard.press('Enter');
    await expect(app.page.locator('main#main')).toBeFocused();

    // Every interactive element that can take focus shows where focus is.
    const lacking = await app.page.evaluate(() => {
      const bad: string[] = [];
      const focusables = Array.from(document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([type=file]), select, textarea, [role="tab"]')).filter(
        (element) => element.offsetParent !== null,
      );
      for (const element of focusables.slice(0, 40)) {
        element.focus();
        const style = getComputedStyle(element);
        const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        const hasRing = style.boxShadow !== 'none';
        const row = element.closest('li');
        if (!hasOutline && !hasRing && !row) bad.push(`${element.tagName.toLowerCase()} ${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 30)}`);
      }
      return bad;
    });
    expect(lacking, 'focusable elements with no visible focus indicator').toEqual([]);
  });

  test('page titles and landmarks exist', async ({ app }) => {
    await open(app.page, '/');
    await expect(app.page.locator('main#main')).toBeVisible();
    await expect(app.page.locator('header')).toHaveCount(1);
    await expect(app.page.getByRole('navigation', { name: 'Main' }).first()).toBeAttached();
    await expect(app.page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(app.page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  test('the document title says where you are', async ({ app }) => {
    const titles = new Set<string>();
    for (const [, path] of PAGES) {
      await open(app.page, path);
      titles.add(await app.page.title());
    }
    expect(titles.size, `every page has the same title: ${[...titles]}`).toBeGreaterThan(1);
  });
});

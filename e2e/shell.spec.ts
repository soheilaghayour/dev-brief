import { expect, test, type Page } from '@playwright/test';

async function hasHorizontalScroll(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the shell renders in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/feed');
    await expect(page.getByRole('banner').getByText('DevBrief')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible();
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark).toBe(colorScheme === 'dark');
  });
}

test('AC-1.3.12 the shell has no horizontal scroll at 360 px and 1280 px', async ({ page }) => {
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/feed');
    await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
  }
});

test('AC-1.3.12 the navigation moves into a sheet below 768 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/feed');
  await expect(page.getByRole('complementary')).toBeHidden();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: /Saved/ })).toBeVisible();
});

test('? opens the shortcuts help from the registry and Esc closes it', async ({ page }) => {
  await page.goto('/feed');
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Go to Feed')).toBeVisible();
  await expect(dialog.getByText('Go to Saved')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('g then s navigates to Saved', async ({ page }) => {
  await page.goto('/feed');
  await page.keyboard.press('j');
  await page.keyboard.press('g');
  await page.keyboard.press('s');
  await expect(page).toHaveURL(/\/saved$/);
  // The `s` that completes the sequence must not also save the active story.
  await expect(page.getByText('Nothing saved yet')).toBeVisible();
});

test('with the OS in dark mode and no stored theme, the first paint is dark', async ({
  browser,
}) => {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  // Without any script chunk, only the inline theme script can have set the class: a flash is
  // what a blocked inline script (e.g. by a CSP without a nonce) would show.
  await page.route('**/_next/static/chunks/**/*.js', (route) => route.abort());
  await page.goto('/feed');
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    'dark',
  );
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const luminance = background
    .match(/\d+(\.\d+)?/g)
    ?.slice(0, 3)
    .map(Number) ?? [255, 255, 255];
  expect(Math.max(...luminance)).toBeLessThan(80);
  await context.close();
});

test('the theme choice persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/feed');
  await page.getByRole('radio', { name: 'Dark' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
});

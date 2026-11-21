import { expect, test, type Page } from '@playwright/test';

// Radar has no flag; this needs the TagDailyStat rows of `pnpm --filter api db:seed:e2e`.

const moversTable = (page: Page) => page.getByRole('table', { name: 'Top movers' });
const chartTable = (page: Page) => page.getByRole('table', { name: /^Velocity/ });
const chartLines = (page: Page) => page.locator('.recharts-line');

async function openRadar(page: Page, search = '') {
  await page.goto(`/radar${search}`);
  await expect(chartLines(page).first()).toBeAttached();
}

test('AC-3.3.1 the movers table is in the server-rendered HTML and the chart draws the top five', async ({
  page,
}) => {
  const html = await (await page.request.get('/radar')).text();
  expect(html).toContain('Top movers');
  expect(html).toContain('Show Rust in chart');

  await openRadar(page);
  await expect(moversTable(page).locator('tbody tr')).toHaveCount(6);
  await expect(chartLines(page)).toHaveCount(5);
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(5);
});

test('AC-3.3.1 switching to 30d writes the URL and loads the 30-day data', async ({ page }) => {
  await openRadar(page);
  const before = await moversTable(page).innerText();

  await page.getByRole('button', { name: '30d' }).click();

  await expect(page).toHaveURL(/window=30d/);
  await expect(page.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => moversTable(page).innerText()).not.toBe(before);
  await page.getByRole('button', { name: 'View as table' }).click();
  await expect(chartTable(page).locator('tbody tr')).toHaveCount(30);
});

test('AC-3.3.1 unticking a tag writes tags to the URL and removes its line', async ({ page }) => {
  await openRadar(page);

  await page.getByRole('checkbox', { name: 'Show Rust in chart' }).uncheck();

  await expect(page).toHaveURL(/tags=/);
  await expect(chartLines(page)).toHaveCount(4);
});

test('AC-3.3.4 View as table swaps the chart for a table of dates and tags, reachable by keyboard', async ({
  page,
}) => {
  await openRadar(page);
  const toggle = page.getByRole('button', { name: 'View as table' });

  await toggle.focus();
  await page.keyboard.press('Enter');

  await expect(chartTable(page).locator('tbody tr')).toHaveCount(7);
  await expect(chartTable(page).locator('thead th')).toHaveCount(6);
  await expect(chartLines(page)).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('AC-3.3.4 the chart table shows the seeded gap day as 0', async ({ page }) => {
  await openRadar(page, '?window=7d');
  await page.getByRole('button', { name: 'View as table' }).click();

  // Midnight-safe: no date arithmetic, the gap day is the one row of only zeros.
  const rows = await chartTable(page)
    .locator('tbody tr')
    .evaluateAll((trs) =>
      trs.map((tr) => [...tr.querySelectorAll('td')].map((cell) => cell.textContent)),
    );
  const gapRows = rows.filter((cells) => cells.every((cell) => cell === '0'));
  expect(gapRows).toHaveLength(1);
});

test('AC-3.3.1 a mover tag opens the feed filtered by it', async ({ page }) => {
  await openRadar(page);
  const link = moversTable(page).locator('tbody tr').first().getByRole('link');
  const href = await link.getAttribute('href');

  await link.click();

  await expect(page).toHaveURL(/\/feed\?tags=/);
  expect(href).toMatch(/^\/feed\?tags=/);
});

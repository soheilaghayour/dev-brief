import { expect, test, type Page } from '@playwright/test';

// Needs the data of `pnpm --filter api db:seed:e2e`: one story titled "Bun runtime reaches production readiness"
// whose excerpt mentions Node.js, 45 more titled "E2E story NN" with the excerpt "Fixture story number N.", and the
// Zephyr cluster, whose representative "Zephyr runtime lands in stable" has the excerpt "Part of the fixture cluster."
const cards = (page: Page) => page.locator('article[data-story-id]');

// A direct load has no previous list, so marks that show are the new search's, from the first render.
async function openSearch(page: Page, query: string) {
  await page.goto(`/feed?q=${encodeURIComponent(query)}`);
}

async function search(page: Page, query: string) {
  await page.goto('/feed');
  // The search box is usable once hydration has finished, which an idle network follows.
  await page.waitForLoadState('networkidle');
  await page.getByRole('searchbox', { name: 'Search stories' }).fill(query);
  await expect(page).toHaveURL(/q=/);
}

test('AC-1.3.14 a piece of a story title is marked in the story card', async ({ page }) => {
  await search(page, 'bun runtime');
  await expect(cards(page)).toHaveCount(1);
  const marks = cards(page).locator('h2 mark');
  await expect(marks).toHaveText(['Bun', 'runtime']);
  await expect(marks.first()).toBeVisible();
  await expect(
    cards(page).getByRole('link', { name: 'Bun runtime reaches production readiness' }),
  ).toBeVisible();
});

test('AC-1.3.14 a piece missing from the title is marked in the excerpt line', async ({ page }) => {
  await openSearch(page, 'bun node');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).locator('h2 mark')).toHaveText(['Bun']);
  const excerptMark = cards(page).locator('p mark');
  await expect(excerptMark).toHaveText(['Node']);
  await expect(excerptMark).toBeVisible();
});

test('AC-1.3.14 the search "runtime" marks the title of both stories that have it there', async ({
  page,
}) => {
  await openSearch(page, 'runtime');
  await expect(cards(page)).toHaveCount(2);
  for (const title of [
    'Bun runtime reaches production readiness',
    'Zephyr runtime lands in stable',
  ]) {
    await expect(cards(page).filter({ hasText: title }).locator('h2 mark')).toHaveText(['runtime']);
  }
  await expect(cards(page).locator('p mark')).toHaveCount(0);
  await expect(cards(page).filter({ hasNot: page.locator('mark') })).toHaveCount(0);
});

test('AC-1.3.14 the search "cluster" marks the excerpt line of a story that has it only there', async ({
  page,
}) => {
  await openSearch(page, 'cluster');
  await expect(cards(page)).toHaveCount(1);
  await expect(
    cards(page).getByRole('link', { name: 'Zephyr runtime lands in stable' }),
  ).toBeVisible();
  await expect(cards(page).locator('h2 mark')).toHaveCount(0);
  await expect(cards(page).locator('p mark')).toHaveText(['cluster']);
  await expect(cards(page).filter({ hasNot: page.locator('mark') })).toHaveCount(0);
});

test('AC-1.3.14 on a 360 px screen the mark in the excerpt line is not cut off', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openSearch(page, 'bun node');
  const mark = cards(page).locator('p mark');
  await expect(mark).toHaveText(['Node']);
  const markBox = await mark.boundingBox();
  const lineBox = await cards(page).locator('p:has(mark)').boundingBox();
  expect(markBox).not.toBeNull();
  expect(lineBox).not.toBeNull();
  expect(markBox!.x).toBeGreaterThanOrEqual(lineBox!.x);
  expect(markBox!.x + markBox!.width).toBeLessThanOrEqual(lineBox!.x + lineBox!.width);
});

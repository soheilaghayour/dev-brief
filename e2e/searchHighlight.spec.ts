import { expect, test, type Page } from '@playwright/test';

// Needs the data of `pnpm --filter api db:seed:e2e`: one story titled "Bun runtime reaches production readiness"
// whose excerpt mentions Node.js, and 45 more titled "E2E story NN" with the excerpt "Fixture story number N."
const cards = (page: Page) => page.locator('article[data-story-id]');

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
  await search(page, 'bun node');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).locator('h2 mark')).toHaveText(['Bun']);
  const excerptMark = cards(page).locator('p mark');
  await expect(excerptMark).toHaveText(['Node']);
  await expect(excerptMark).toBeVisible();
});

for (const query of ['story', 'fixture']) {
  test(`AC-1.3.14 every card of the search "${query}" shows a mark`, async ({ page }) => {
    await search(page, query);
    await expect(cards(page).first()).toBeVisible();
    // Cards of the previous result carry no mark, so this settles only on the new list.
    await expect(cards(page).filter({ hasNot: page.locator('mark') })).toHaveCount(0);
    expect(await cards(page).count()).toBeGreaterThan(0);
  });
}

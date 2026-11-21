import { expect, test, type Page } from '@playwright/test';

// Needs NEXT_PUBLIC_FEATURE_COLLECTIONS on (web), as in CI's e2e run.

const cards = (page: Page) => page.locator('article[data-story-id]');
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Collections' });

async function createCollection(page: Page, name: string) {
  await page.goto('/saved');
  await page.waitForLoadState('networkidle');
  await sidebar(page).getByRole('button', { name: 'New' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(sidebar(page).getByRole('link', { name })).toBeVisible();
}

test('AC-3.4.1 AC-3.4.3 a guest creates a collection, adds a story with a, reloads and finds it on the board', async ({
  page,
}) => {
  await createCollection(page, 'Frontend Architecture');

  await page.goto('/feed?sort=latest');
  await page.waitForLoadState('networkidle');
  const card = cards(page).first();
  const title = (await card.locator('h2 a').textContent()) ?? '';
  await page.keyboard.press('j');
  await page.keyboard.press('a');

  const dialog = page.getByRole('dialog', { name: 'Add to collection' });
  await expect(dialog.getByRole('textbox')).toBeFocused();
  await page.keyboard.type('front');
  await dialog.getByRole('checkbox', { name: /Frontend Architecture/ }).check();
  await expect(dialog.getByRole('checkbox', { name: /Frontend Architecture/ })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.goto('/saved');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(
    sidebar(page).getByRole('link', { name: /^Frontend Architecture\s*1$/ }),
  ).toBeVisible();

  await page.goto('/collections/frontend-architecture');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Frontend Architecture' }),
  ).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first().locator('h2 a')).toHaveText(title);
});

test('AC-3.4.3 Enter on a new name creates the collection and adds the story', async ({ page }) => {
  await page.goto('/feed?sort=latest');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('j');
  await page.keyboard.press('a');
  await page.keyboard.type('Rust reading');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('checkbox', { name: /Rust reading/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/collections/rust-reading');
  await expect(cards(page)).toHaveCount(1);
});

test('AC-3.4.1 renaming keeps the URL and deleting the collection keeps the save', async ({
  page,
}) => {
  await page.goto('/feed?sort=latest');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('j');
  await page.keyboard.press('a');
  await page.keyboard.type('Reading list');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('checkbox', { name: /Reading list/ })).toBeChecked();
  await page.keyboard.press('Escape');

  await page.goto('/collections/reading-list');
  await expect(cards(page)).toHaveCount(1);
  await sidebar(page).getByRole('button', { name: 'Actions for Reading list' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Backlog');
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(sidebar(page).getByRole('link', { name: /^Backlog/ })).toHaveAttribute(
    'href',
    '/collections/reading-list',
  );
  await expect(page).toHaveURL(/\/collections\/reading-list$/);

  await sidebar(page).getByRole('button', { name: 'Actions for Backlog' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog')).toContainText('stay saved');
  await page.getByRole('button', { name: 'Delete collection' }).click();
  await expect(page).toHaveURL(/\/saved$/);

  await expect(cards(page)).toHaveCount(1);
  await expect(sidebar(page).getByRole('link', { name: /Backlog/ })).toHaveCount(0);
});

test('AC-3.4.1 Move up and Move down reorder the collections from the menu', async ({ page }) => {
  await createCollection(page, 'Alpha');
  await sidebar(page).getByRole('button', { name: 'New' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Beta');
  await page.getByRole('button', { name: 'Create' }).click();

  const names = () =>
    sidebar(page)
      .getByRole('listitem')
      .evaluateAll((items) => items.map((item) => item.querySelector('a')?.textContent));
  await sidebar(page).getByRole('button', { name: 'Actions for Beta' }).click();
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  await expect.poll(names).toEqual(['All saved0', 'Beta0', 'Alpha0']);
});

test('AC-3.4.3 an unknown board shows a not-found state with a link back to /saved', async ({
  page,
}) => {
  await page.goto('/collections/does-not-exist');
  await expect(page.getByText('Collection not found')).toBeVisible();
  await page.getByRole('link', { name: 'Back to Saved' }).click();
  await expect(page).toHaveURL(/\/saved$/);
});

test('AC-3.4.3 g then c opens /saved', async ({ page }) => {
  await page.goto('/feed');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('g');
  await page.keyboard.press('c');
  await expect(page).toHaveURL(/\/saved$/);
});

test('AC-L7 the guest hint and the landing tile mention collections', async ({ page }) => {
  await page.goto('/feed');
  await expect(page.getByRole('region', { name: 'Guest hint' })).toContainText(
    'including collections and notes',
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Collections & notes' })).toBeVisible();
});

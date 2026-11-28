import { expect, test, type Page } from '@playwright/test';
import { signInThroughTestRoute } from './signIn';

// Needs FEATURE_COLLECTIONS on for the API and the web build, as in CI's e2e run.

const cards = (page: Page) => page.locator('article[data-story-id]');
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Collections' });

// The hotkeys flag marks the page as hydrated, so the click is not lost.
async function openAddDialog(page: Page) {
  await page.goto('/feed?sort=latest');
  await expect(page.locator('html[data-hotkeys-ready]')).toBeAttached();
  const addButton = cards(page).first().getByRole('button', { name: 'Add to collection' });
  await addButton.click();
  const dialog = page.getByRole('dialog', { name: 'Add to collection' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox')).toBeFocused();
  return dialog;
}

async function createCollection(page: Page, name: string) {
  await page.goto('/saved');
  await page.waitForLoadState('networkidle');
  await sidebar(page).getByRole('button', { name: 'New' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(sidebar(page).getByRole('link', { name })).toBeVisible();
}

test('AC-3.4.1 AC-3.4.3 a guest creates a collection, adds a story from its card, reloads and finds it on the board', async ({
  page,
}) => {
  await createCollection(page, 'Frontend Architecture');

  const dialog = await openAddDialog(page);
  const title = (await cards(page).first().locator('h2 a').textContent()) ?? '';
  await page.keyboard.type('front');
  await dialog.getByRole('checkbox', { name: /Frontend Architecture/ }).click();
  await expect(dialog.getByRole('checkbox', { name: /Frontend Architecture/ })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(
    cards(page).first().getByRole('button', { name: 'Add to collection' }),
  ).toBeFocused();

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
  await openAddDialog(page);
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
  await openAddDialog(page);
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

test('/saved and a board load without layout shift while the sidebar is fetched', async ({
  page,
}) => {
  await page.goto('/feed?sort=latest');
  await expect(cards(page).first()).toBeVisible();
  const ids = await cards(page).evaluateAll((els) =>
    els.slice(0, 2).map((el) => el.getAttribute('data-story-id')),
  );
  await page.evaluate((storyIds) => {
    const now = new Date().toISOString();
    localStorage.setItem(
      'devbrief:guest:v1',
      JSON.stringify({
        version: 1,
        deviceId: '3f2b8f0e-6a52-4c53-9a39-6b1c2f1e7a10',
        saves: storyIds.map((storyId) => ({ storyId, savedAt: now })),
        prefs: { follow: { tags: [], sources: [] }, mute: { tags: [], sources: [] } },
        collections: ['Alpha', 'Beta'].map((name, position) => ({
          id: `id-${name}`,
          slug: name.toLowerCase(),
          name,
          description: null,
          position,
          items: storyIds.map((storyId, item) => ({ storyId, position: item, addedAt: now })),
        })),
        hintDismissed: true,
        pendingMerge: false,
      }),
    );
  }, ids);
  await page.addInitScript(() => {
    const shifts = { total: 0 };
    (window as unknown as { __shifts: typeof shifts }).__shifts = shifts;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[])
        if (!entry.hadRecentInput) shifts.total += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });

  for (const path of ['/saved', '/collections/alpha']) {
    await page.goto(path);
    await expect(cards(page)).toHaveCount(2);
    await expect(sidebar(page).getByRole('link', { name: /^Alpha/ })).toBeVisible();
    const total = await page.evaluate(
      () => (window as unknown as { __shifts: { total: number } }).__shifts.total,
    );
    console.log(`CLS ${path} ${total}`);
    expect(total, path).toBeLessThan(0.05);
  }
});

const NOTE = 'Merged with the **account**';

async function selectFirstStory(page: Page) {
  await page.goto('/feed?sort=latest');
  await expect(cards(page).first()).toBeVisible();
  return (await cards(page).first().getAttribute('data-story-id')) ?? '';
}

// A guest saves the first story, notes it and puts it on a new board.
async function guestBoardWithNote(page: Page, board: string) {
  const id = await selectFirstStory(page);
  await page.goto(`/story/${id}`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const note = page.getByRole('textbox', { name: 'Note' });
  await expect(note).toBeVisible();
  await note.fill(NOTE);
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

  await createCollection(page, board);
  await cards(page).first().getByRole('button', { name: 'Add to collection' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to collection' });
  await dialog.getByRole('checkbox', { name: new RegExp(board) }).click();
  await expect(dialog.getByRole('checkbox', { name: new RegExp(board) })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(
    sidebar(page).getByRole('link', { name: new RegExp(`^${board}\\s*1$`) }),
  ).toBeVisible();
  return id;
}

// The device released everything it sent, so what follows can only come from the account.
async function signInAndMerge(page: Page, board: string) {
  const id = await guestBoardWithNote(page, board);
  const email = await signInThroughTestRoute(page);
  await page.goto('/saved');
  await expect(page.getByText('1 saved story, 1 collection and 1 note synced')).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  return { id, email };
}

test('AC-3.4.5 a guest board, story and note merge on sign-in and then come from the server', async ({
  page,
}) => {
  const { id } = await signInAndMerge(page, 'Merge board');
  await expect(sidebar(page).getByRole('link', { name: /^Merge board\s*1$/ })).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toHaveAttribute('data-story-id', id);
  await expect(cards(page).first()).toContainText(`📝 ${NOTE}`);
  await page.goto('/collections/merge-board');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText(`📝 ${NOTE}`);
});

test('AC-1.5.8 AC-3.4.5 signing out empties the device, and signing in again finds everything in the account', async ({
  page,
}) => {
  const { email } = await signInAndMerge(page, 'Return board');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible();
  await page.goto('/saved');
  await expect(sidebar(page).getByRole('link', { name: /Return board/ })).toHaveCount(0);
  await signInThroughTestRoute(page, email);
  await page.goto('/saved');
  await expect(sidebar(page).getByRole('link', { name: /^Return board\s*1$/ })).toBeVisible();
});

test('AC-3.4.3 a signed-in rename is kept by the server and survives a reload', async ({
  page,
}) => {
  await signInAndMerge(page, 'Old name');
  await sidebar(page).getByRole('button', { name: 'Actions for Old name' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Backlog');
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(sidebar(page).getByRole('link', { name: /^Backlog/ })).toHaveAttribute(
    'href',
    '/collections/old-name',
  );
  await page.reload();
  await expect(sidebar(page).getByRole('link', { name: /^Backlog\s*1$/ })).toBeVisible();
  await expect(sidebar(page).getByRole('link', { name: /Old name/ })).toHaveCount(0);
});

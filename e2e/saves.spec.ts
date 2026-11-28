import { expect, test, type Page } from '@playwright/test';

const cards = (page: Page) => page.locator('article[data-story-id]');
const saveButton = (card: ReturnType<typeof cards>) =>
  card.getByRole('button', { name: 'Save story' });
const TOAST = 'Saved on this device · Sign in to sync';

async function openFeed(page: Page, search = '') {
  await page.goto(`/feed${search}`);
  // The sidebar fetches tags and sources after hydration, so an idle network means the page is interactive.
  await page.waitForLoadState('networkidle');
  // A tag checkbox only exists once the client has fetched the tags, so the page is hydrated and clicks are not lost.
  await expect(page.getByRole('checkbox', { name: /^React\b/ })).toBeVisible();
}

test('AC-1.4.1 AC-1.4.2 AC-1.4.3 a guest filters by tag, saves, reloads and finds the save on /saved', async ({
  page,
}) => {
  await openFeed(page);
  await page.getByRole('checkbox', { name: /^React\b/ }).check();
  await expect(page).toHaveURL(/tags=react/);

  const card = cards(page).first();
  const title = (await card.locator('h2 a').textContent()) ?? '';
  const id = (await card.getAttribute('data-story-id')) ?? '';
  await saveButton(card).click();
  await expect(saveButton(card)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(TOAST)).toBeVisible();

  const stored = await page.evaluate(() => localStorage.getItem('devbrief:guest:v1'));
  expect(JSON.parse(stored ?? 'null')).toMatchObject({
    version: 1,
    saves: [{ storyId: id }],
    hintDismissed: false,
  });

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(saveButton(cards(page).first())).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('link', { name: 'Saved' }).first().click();
  await expect(page).toHaveURL(/\/saved$/);
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first().locator('h2 a')).toHaveText(title);
});

test('AC-1.4.1 saving a story shows the toast once per session', async ({ page }) => {
  await openFeed(page, '?sort=latest');
  await saveButton(cards(page).first()).click();
  await expect(saveButton(cards(page).first())).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(TOAST)).toBeVisible();

  await saveButton(cards(page).nth(1)).click();
  await expect(saveButton(cards(page).nth(1))).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(TOAST)).toHaveCount(1);

  await saveButton(cards(page).nth(1)).click();
  await expect(saveButton(cards(page).nth(1))).toHaveAttribute('aria-pressed', 'false');
});

test('AC-1.4.3 /saved lists newest-saved first and drops a purged story with a notice', async ({
  page,
}) => {
  await openFeed(page, '?sort=latest');
  const first = cards(page).nth(0);
  const second = cards(page).nth(1);
  const firstId = (await first.getAttribute('data-story-id')) ?? '';
  const secondId = (await second.getAttribute('data-story-id')) ?? '';
  await saveButton(first).click();
  await expect(saveButton(first)).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(20);
  await saveButton(second).click();
  await expect(saveButton(second)).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('devbrief:guest:v1') ?? '{}');
    stored.saves.push({ storyId: 'cpurgedstoryxxxxxxxxxxxx', savedAt: '2020-01-01T00:00:00.000Z' });
    localStorage.setItem('devbrief:guest:v1', JSON.stringify(stored));
  });
  await page.goto('/saved');

  await expect(cards(page)).toHaveCount(2);
  const ids = await cards(page).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-story-id')),
  );
  expect(ids).toEqual([secondId, firstId]);
  await expect(
    page.getByText('1 saved story is no longer available and was removed.'),
  ).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem('devbrief:guest:v1'));
  expect(stored).not.toContain('cpurgedstoryxxxxxxxxxxxx');
});

test('AC-1.4.3 /saved shows an empty state without saves', async ({ page }) => {
  await page.goto('/saved');
  await expect(page.getByText('Nothing saved yet')).toBeVisible();
});

test('AC-1.4.4 saving works when localStorage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  await openFeed(page);
  const card = cards(page).first();
  await saveButton(card).click();
  await expect(saveButton(card)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Your browser blocks storage/)).toBeVisible();
});

test('the guest hint links to sign-in with the current URL and stays dismissed after a reload', async ({
  page,
}) => {
  await openFeed(page, '?tags=react');
  const hint = page.getByRole('region', { name: 'Guest hint' });
  await expect(hint).toContainText("You're browsing as a guest. Saves stay on this device.");
  await expect(hint.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/sign-in?callbackURL=%2Ffeed%3Ftags%3Dreact',
  );

  const card = cards(page).first();
  await saveButton(card).click();
  await hint.getByRole('button', { name: 'Dismiss' }).click();
  await expect(hint).toBeHidden();
  await page.reload();
  await page.waitForLoadState('networkidle');
  // A pressed Save shows the store has loaded, so the hidden hint is the stored dismissal.
  await expect(saveButton(cards(page).first())).toHaveAttribute('aria-pressed', 'true');
  await expect(hint).toBeHidden();
});

test('AC-1.3.9 the guest hint appears without moving the feed', async ({ page }) => {
  await page.goto('/feed?sort=latest');
  const firstCard = cards(page).first();
  await expect(firstCard).toBeVisible();
  const before = await firstCard.boundingBox();
  const hint = page.getByRole('region', { name: 'Guest hint' });
  await expect(hint).toBeVisible();
  await expect(hint).toHaveCSS('position', 'fixed');
  expect((await firstCard.boundingBox())?.y).toBe(before?.y);
});

test("AC-1.4.2 two open tabs keep each other's saves", async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await openFeed(first, '?sort=latest');
  await openFeed(second, '?sort=latest');

  await saveButton(cards(first).nth(0)).click();
  await expect(saveButton(cards(first).nth(0))).toHaveAttribute('aria-pressed', 'true');
  await saveButton(cards(second).nth(1)).click();
  await expect(saveButton(cards(second).nth(1))).toHaveAttribute('aria-pressed', 'true');

  await first.reload();
  await first.waitForLoadState('networkidle');
  await expect(saveButton(cards(first).nth(0))).toHaveAttribute('aria-pressed', 'true');
  await expect(saveButton(cards(first).nth(1))).toHaveAttribute('aria-pressed', 'true');
});

test('unsaving from /saved takes the card off the list and out of the store', async ({ page }) => {
  await openFeed(page, '?sort=latest');
  await saveButton(cards(page).nth(0)).click();
  await expect(saveButton(cards(page).nth(0))).toHaveAttribute('aria-pressed', 'true');
  await saveButton(cards(page).nth(1)).click();
  await expect(saveButton(cards(page).nth(1))).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/saved');
  await expect(cards(page)).toHaveCount(2);
  await saveButton(cards(page).nth(0)).click();

  await expect(cards(page)).toHaveCount(1);
  const stored = await page.evaluate(() => localStorage.getItem('devbrief:guest:v1'));
  expect(JSON.parse(stored ?? '{}').saves).toHaveLength(1);
});

test('AC-1.3.7 the story page Save button reflects and toggles the saved state', async ({
  page,
}) => {
  await openFeed(page, '?sort=latest');
  const id = (await cards(page).first().getAttribute('data-story-id')) ?? '';
  await page.goto(`/story/${id}`);
  const save = page.getByRole('button', { name: 'Save' });
  await save.click();
  await expect(save).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(save).toHaveAttribute('aria-pressed', 'true');
});

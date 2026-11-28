import { expect, test, type Page } from '@playwright/test';
import { signInThroughTestRoute } from './signIn';

// Preferences have no flag; this needs only the seeded e2e database.
// The guest store's key (`GUEST_STORAGE_KEY` in apps/web/src/lib/guest/guestStore.ts).
const GUEST_STORAGE_KEY = 'devbrief:guest:v1';

const cards = (page: Page) => page.locator('article[data-story-id]');
const tagBadges = (page: Page, slug: string) => cards(page).locator(`[data-tag="${slug}"]`);
const heart = (page: Page, label: string) =>
  page.getByRole('button', { name: new RegExp(`^${label}: `) });

async function openFeed(page: Page) {
  await page.goto('/feed');
  // The sidebar fetches tags and sources after hydration, so an idle network means the page is interactive.
  await page.waitForLoadState('networkidle');
}

async function storedPrefs(page: Page) {
  const stored = await page.evaluate((key) => localStorage.getItem(key), GUEST_STORAGE_KEY);
  return (JSON.parse(stored ?? '{}') as { prefs?: unknown }).prefs;
}

test('AC-2.5.1 AC-2.5.2 a guest follows then mutes a tag with its heart, its stories leave the feed and stay hidden after a reload', async ({
  page,
}) => {
  await openFeed(page);
  await expect(tagBadges(page, 'rust').first()).toBeVisible();
  const rustHeart = heart(page, 'Rust');
  await expect(rustHeart).toBeEnabled();

  await rustHeart.click();
  await expect(rustHeart).toHaveAccessibleName('Rust: following. Click to mute.');
  await expect(tagBadges(page, 'rust').first()).toBeVisible();
  await rustHeart.click();
  await expect(rustHeart).toHaveAccessibleName('Rust: muted. Click to clear.');

  await expect(tagBadges(page, 'rust')).toHaveCount(0);
  // The heart is not the row's filter, and it keeps focus when the cards leave.
  await expect(rustHeart).toBeFocused();
  expect(new URL(page.url()).search).toBe('');
  expect(await storedPrefs(page)).toEqual({
    follow: { tags: [], sources: [] },
    mute: { tags: ['rust'], sources: [] },
  });

  // The server-rendered page can't know the mute: the client hides its cards, then asks for the personalised page.
  const personalised = page.waitForRequest(
    (request) =>
      request.url().includes('/api/v1/feed?') && request.url().includes('excludeTags=rust'),
  );
  await page.reload();
  await personalised;
  await page.waitForLoadState('networkidle');
  await expect(tagBadges(page, 'rust')).toHaveCount(0);
  // A muted tag stays in the list with the crossed heart.
  await expect(heart(page, 'Rust')).toHaveAccessibleName('Rust: muted. Click to clear.');
  expect(new URL(page.url()).search).toBe('');

  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Rust: muted. Click to clear.' })).toBeVisible();
});

test('AC-2.5.1 AC-2.5.2 a guest mutes a source kind with its heart and its stories leave the feed', async ({
  page,
}) => {
  await openFeed(page);
  const before = await cards(page).count();
  const kindHeart = heart(page, 'Hacker News');
  await expect(kindHeart).toBeEnabled();

  await kindHeart.click();
  await expect(kindHeart).toHaveAccessibleName('Hacker News: following. Click to mute.');
  await kindHeart.click();
  await expect(kindHeart).toHaveAccessibleName('Hacker News: muted. Click to clear.');

  await expect.poll(() => cards(page).count()).toBeLessThan(before);
  await expect(kindHeart).toBeFocused();
});

test('AC-2.5.1 AC-2.5.3 a guest follows a tag by keyboard, signs in, and Settings shows the follow from the server', async ({
  page,
}) => {
  await openFeed(page);
  const databasesHeart = heart(page, 'Databases');
  await expect(databasesHeart).toBeEnabled();
  await databasesHeart.focus();
  await page.keyboard.press('Enter');
  await expect(databasesHeart).toHaveAccessibleName('Databases: following. Click to mute.');
  await expect
    .poll(() => storedPrefs(page))
    .toEqual({
      follow: { tags: ['databases'], sources: [] },
      mute: { tags: [], sources: [] },
    });

  await signInThroughTestRoute(page);
  await page.goto('/feed');
  // The merge carried the follow, and the device let go of it once the server confirmed.
  await expect
    .poll(() => storedPrefs(page))
    .toEqual({ follow: { tags: [], sources: [] }, mute: { tags: [], sources: [] } });

  await page.goto('/settings');
  await expect(
    page.getByRole('button', { name: 'Databases: following. Click to mute.' }),
  ).toBeVisible();
});

test('AC-2.5.1 a tag badge on a card opens no menu', async ({ page }) => {
  await openFeed(page);
  await tagBadges(page, 'rust').first().click();
  await expect(page.getByRole('menu')).toHaveCount(0);
});

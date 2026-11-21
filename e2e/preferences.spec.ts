import { expect, test, type Page } from '@playwright/test';
import { signInThroughTestRoute } from './signIn';

// Needs NEXT_PUBLIC_FEATURE_PREFERENCES and FEATURE_PREFERENCES on, as in CI's e2e build.
// The guest store's key (`GUEST_STORAGE_KEY` in apps/web/src/lib/guest/guestStore.ts).
const GUEST_STORAGE_KEY = 'devbrief:guest:v1';

const cards = (page: Page) => page.locator('article[data-story-id]');
const tagBadges = (page: Page, slug: string) => cards(page).locator(`[data-tag="${slug}"]`);

async function openFeed(page: Page) {
  await page.goto('/feed');
  // The sidebar fetches tags and sources after hydration, so an idle network means the page is interactive.
  await page.waitForLoadState('networkidle');
}

async function storedPrefs(page: Page) {
  const stored = await page.evaluate((key) => localStorage.getItem(key), GUEST_STORAGE_KEY);
  return (JSON.parse(stored ?? '{}') as { prefs?: unknown }).prefs;
}

test('AC-2.5.1 AC-2.5.2 a guest mutes a tag from a badge, its stories disappear and stay hidden after a reload', async ({
  page,
}) => {
  await openFeed(page);
  await expect(tagBadges(page, 'rust').first()).toBeVisible();

  await tagBadges(page, 'rust').first().click();
  await expect(page.getByRole('menu')).toContainText('Rust');
  await page.getByRole('menuitemcheckbox', { name: 'Mute' }).click();

  await expect(tagBadges(page, 'rust')).toHaveCount(0);
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
  expect(new URL(page.url()).search).toBe('');

  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Unmute Rust' })).toBeVisible();
});

test('AC-2.5.1 AC-2.5.3 a guest follows a tag by keyboard, signs in, and Settings shows the follow from the server', async ({
  page,
}) => {
  await openFeed(page);
  const badge = tagBadges(page, 'databases').first();
  await badge.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toContainText('Databases');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemcheckbox', { name: 'Follow' })).toBeFocused();
  await page.keyboard.press('Enter');
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
  await expect(page.getByRole('button', { name: 'Unfollow Databases' })).toBeVisible();
});

test('AC-2.5.1 Space opens a badge menu, Esc closes it, and a mute leaves focus on the next card', async ({
  page,
}) => {
  await openFeed(page);
  const badge = tagBadges(page, 'rust').first();
  await badge.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('menu')).toContainText('Rust');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  await page.keyboard.press('Space');
  await page.getByRole('menuitemcheckbox', { name: 'Mute' }).click();
  await expect(tagBadges(page, 'rust')).toHaveCount(0);
  // Focus must not fall back to the page.
  await expect(page.locator('body')).not.toBeFocused();
});

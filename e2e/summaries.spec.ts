import { expect, test, type Locator, type Page } from '@playwright/test';

// Fixed ids from apps/api/prisma/seedE2e.ts; generation is covered by integration and component tests, since CI never calls the model.
const STORY_WITH_CONSENSUS = 'ce2e00000004';
const STORY_WITHOUT_CONSENSUS = 'ce2e00000005';
const UNSUMMARISED_STORY = 'ce2e00000001';
// A blog-only story: it has nothing to summarise, so `u` has nothing to start.
const BLOG_ONLY_STORY = 'ce2e00000003';
const SUMMARY_LINE = 'First point of the fixture summary.';

const clampedLine = (card: Locator) => card.locator('p.line-clamp-2');
const card = (page: Page, id: string) => page.locator(`article[data-story-id="${id}"]`);

async function openFeedWithHotkeys(page: Page, search: string) {
  await page.goto(`/feed${search}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html[data-hotkeys-ready]')).toBeAttached();
}

test('AC-2.3.6 a stored summary renders as labelled plain text with its consensus', async ({
  page,
}) => {
  await page.goto(`/story/${STORY_WITH_CONSENSUS}`);

  await expect(page.getByText('First point of the fixture summary.')).toBeVisible();
  await expect(page.getByText('AI-generated · based on 12 comments')).toBeVisible();
  await expect(page.getByText('Mixed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Summarize' })).toHaveCount(0);
});

test('AC-2.3.6 a summary without consensus says there is not enough discussion yet', async ({
  page,
}) => {
  await page.goto(`/story/${STORY_WITHOUT_CONSENSUS}`);

  await expect(page.getByText('Second point of the fixture summary.')).toBeVisible();
  await expect(page.getByText('Not enough discussion yet')).toBeVisible();
});

test('the feed marks a summarised story with a TL;DR badge that opens the story', async ({
  page,
}) => {
  await page.goto('/feed?sort=latest');
  await page.waitForLoadState('networkidle');

  await page
    .locator(`article[data-story-id="${STORY_WITH_CONSENSUS}"]`)
    .getByRole('link', { name: /AI summary/ })
    .click();

  await expect(page).toHaveURL(new RegExp(`/story/${STORY_WITH_CONSENSUS}$`));
});

test('AC-2.3.9 the feed shows the first TL;DR point under the title of a summarised story and nothing on one without', async ({
  page,
}) => {
  await openFeedWithHotkeys(page, '?sort=latest');

  const summarised = card(page, STORY_WITH_CONSENSUS);
  await expect(clampedLine(summarised)).toHaveText(SUMMARY_LINE);
  await expect(summarised.getByRole('link', { name: /AI summary/ })).toBeVisible();
  await expect(clampedLine(card(page, UNSUMMARISED_STORY))).toHaveCount(0);
});

test('AC-2.3.9 a saved summarised story shows its line on /saved', async ({ page }) => {
  await openFeedWithHotkeys(page, '?sort=latest');
  await card(page, STORY_WITH_CONSENSUS).getByRole('button', { name: 'Save story' }).click();

  await page.goto('/saved');
  await expect(clampedLine(card(page, STORY_WITH_CONSENSUS))).toHaveText(SUMMARY_LINE);
});

test('AC-2.3.9 the landing preview shows the line of a summarised story', async ({ page }) => {
  await page.goto('/');
  const preview = page.getByRole('group', { name: 'Live feed preview' });
  await expect(preview.locator('p.line-clamp-2', { hasText: SUMMARY_LINE }).first()).toBeVisible();
});

test('AC-2.3.12 u opens the story page to summarise, and does nothing on a story with no input', async ({
  page,
}) => {
  await openFeedWithHotkeys(page, `?sort=latest&focus=${BLOG_ONLY_STORY}`);
  await page.keyboard.press('u');
  // A no-op has no event to wait for, so give a navigation time to start.
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(new RegExp(`/feed\\?sort=latest&focus=${BLOG_ONLY_STORY}$`));

  await openFeedWithHotkeys(page, `?sort=latest&focus=${UNSUMMARISED_STORY}`);
  await page.keyboard.press('u');
  await expect(page).toHaveURL(new RegExp(`/story/${UNSUMMARISED_STORY}\\?summarize=1`));
});

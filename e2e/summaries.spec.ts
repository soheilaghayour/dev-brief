import { expect, test } from '@playwright/test';

// Fixed ids from apps/api/prisma/seedE2e.ts; generation is covered by integration and component tests, since CI never calls the model.
const STORY_WITH_CONSENSUS = 'ce2e00000004';
const STORY_WITHOUT_CONSENSUS = 'ce2e00000005';

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

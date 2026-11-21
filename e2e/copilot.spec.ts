import { expect, test, type Page } from '@playwright/test';

// Only the paths that make no model call run here (CI never calls the LLM): the stored answer to
// suggestion #1, seeded by apps/api/prisma/seedE2e.ts, and a question with no coverage.
const SUGGESTION_1 = "What were this week's TypeScript tooling debates?";
const BRIEFING_TITLE = "TypeScript tooling: this week's debates";
// The briefing's story card: the seed points the stored briefing at its first fixture story.
const STORY_ID = 'ce2e00000001';
const STORY_TITLE = 'E2E story 01';

// A string only the lazily loaded command bar contains.
const BAR_MARKER = 'Your question';

/** Records every script response that contains the command bar, so a spec can tell when its chunk arrived. */
function watchBarChunks(page: Page) {
  const chunks: string[] = [];
  page.on('response', async (response) => {
    if (!response.url().endsWith('.js')) return;
    const text = await response.text().catch(() => '');
    if (text.includes(BAR_MARKER)) chunks.push(response.url());
  });
  return chunks;
}

async function openFeed(page: Page) {
  await page.goto('/feed');
  await expect(page.locator('html[data-hotkeys-ready]')).toBeAttached();
  // The launcher registers ⌘K once its own chunk has loaded, a moment after the bindings.
  await expect(page.getByRole('button', { name: /^Ask/ })).toBeVisible();
}

const bar = (page: Page) => page.getByRole('dialog', { name: 'Ask the News' });

test('AC-3.1.1 the copilot chunk is fetched only after the first open, from inside a search input', async ({
  page,
}) => {
  const chunks = watchBarChunks(page);
  await openFeed(page);
  await page.waitForLoadState('networkidle');
  expect(chunks).toEqual([]);

  await page.getByLabel('Search stories').focus();
  await page.keyboard.press('Control+k');

  await expect(bar(page)).toBeVisible();
  await expect.poll(() => chunks.length).toBeGreaterThan(0);
});

test('AC-3.1.1 the bar has three suggestions, a 200-character input and the quota badge', async ({
  page,
}) => {
  await openFeed(page);
  await page.getByRole('button', { name: /^Ask/ }).click();

  await expect(bar(page)).toBeVisible();
  await expect(
    bar(page).getByRole('list', { name: 'Suggested questions' }).getByRole('button'),
  ).toHaveCount(3);
  await expect(bar(page).getByLabel('Your question')).toHaveAttribute('maxlength', '200');
  await expect(bar(page).getByText('3/3 left')).toBeVisible();
});

test('AC-3.1.1 suggestion #1 shows the skeleton, then the stored briefing; a story card opens its story and closes the bar', async ({
  page,
}) => {
  // Holds the answer back so the skeleton is on screen long enough to be seen.
  await page.route('**/api/v1/copilot/ask', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({ response });
  });
  await openFeed(page);
  await page.keyboard.press('Control+k');
  await expect(bar(page)).toBeVisible();

  await bar(page).getByRole('button', { name: SUGGESTION_1 }).click();

  await expect(bar(page).getByRole('status', { name: 'Preparing your briefing' })).toBeVisible();
  await expect(bar(page).getByText(BRIEFING_TITLE)).toBeVisible();
  await expect(bar(page).getByRole('status', { name: 'Preparing your briefing' })).toHaveCount(0);
  await expect(bar(page).getByText('Your briefing is ready.')).toBeAttached();

  // The card's own title link: the [1] footnote chip only scrolls to the card.
  await bar(page).locator(`article a[href="/story/${STORY_ID}"]`).click();

  await expect(page).toHaveURL(new RegExp(`/story/${STORY_ID}$`));
  await expect(page.getByRole('heading', { level: 1, name: STORY_TITLE })).toBeVisible();
  // Following the link closes the bar, so the reader is not left behind a modal.
  await expect(bar(page)).toHaveCount(0);
});

test('on a 360 px screen the Ask button is not covered and a tap opens the bar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openFeed(page);
  const ask = page.getByRole('button', { name: /^Ask/ });

  const box = (await ask.boundingBox())!;
  const topmostIsAsk = await ask.evaluate(
    (button, point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      return hit !== null && button.contains(hit);
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(topmostIsAsk).toBe(true);

  // A click at the button's centre lands on whatever is topmost there, as a tap would.
  await ask.click();
  await expect(bar(page)).toBeVisible();
});

test('a question with no coverage renders "Not enough coverage" and costs no quota', async ({
  page,
}) => {
  await openFeed(page);
  await page.keyboard.press('Control+k');

  await bar(page).getByLabel('Your question').fill('COBOL on the blockchain');
  await bar(page).getByLabel('Your question').press('Enter');

  await expect(bar(page).getByText('Not enough coverage')).toBeVisible();
  await expect(bar(page).getByText('3/3 left')).toBeVisible();
});

test('AC-3.1.1 Esc closes the bar and returns focus to the field it was opened from', async ({
  page,
}) => {
  await openFeed(page);
  const search = page.getByLabel('Search stories');
  await search.focus();
  await page.keyboard.press('Control+k');
  await expect(bar(page)).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(bar(page)).toHaveCount(0);
  await expect(search).toBeFocused();
});

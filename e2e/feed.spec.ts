import { expect, test, type Page } from '@playwright/test';

// Needs the API's FEATURE_CLUSTERS on, as in CI's e2e run: with it off the cluster shows as 3 cards, so the count is 48.
// The data comes from `pnpm --filter api db:seed:e2e`: 45 stories and the fixture cluster's one card in the Top window, plus one archive story.
const TOP_STORY_COUNT = 46;

const cards = (page: Page) => page.locator('article[data-story-id]');
const activeCard = (page: Page) => page.locator('article[data-active="true"]');

async function openFeed(page: Page, search = '') {
  await page.goto(`/feed${search}`);
  // The sidebar fetches tags and sources after hydration, so an idle network means the page is interactive.
  await page.waitForLoadState('networkidle');
}

async function cardTitles(page: Page) {
  return cards(page).locator('h2 a').allTextContents();
}

test('AC-1.3.1 the first 20 cards are in the server-rendered HTML', async ({ page }) => {
  const html = await (await page.request.get('/feed')).text();
  expect(html.match(/data-story-id=/g)).toHaveLength(20);
});

test('AC-1.3.2 Latest orders by publish time with no time window', async ({ page }) => {
  await openFeed(page, '?sort=latest');
  const titles = await cardTitles(page);
  expect(titles.slice(0, 2)).toEqual(['E2E story 01', 'E2E story 02']);

  await openFeed(page);
  expect((await cardTitles(page)).slice(0, 2)).not.toEqual(['E2E story 01', 'E2E story 02']);
});

test('AC-1.3.3 tags combine with OR, kinds with AND against tags', async ({ page }) => {
  await openFeed(page, '?tags=react,typescript');
  const tagSets = await cards(page).evaluateAll((elements) =>
    elements.map((element) =>
      [...element.querySelectorAll('[data-tag]')].map((tag) => tag.getAttribute('data-tag')),
    ),
  );
  expect(tagSets.length).toBeGreaterThan(0);
  for (const tags of tagSets) {
    expect(tags.some((tag) => tag === 'react' || tag === 'typescript')).toBe(true);
  }
  expect(tagSets.some((tags) => tags.includes('react'))).toBe(true);
  expect(tagSets.some((tags) => tags.includes('typescript'))).toBe(true);

  await openFeed(page, '?kinds=hn');
  const kindSets = await cards(page).evaluateAll((elements) =>
    elements.map((element) =>
      [...element.querySelectorAll('[data-source-kind]')].map((badge) =>
        badge.getAttribute('data-source-kind'),
      ),
    ),
  );
  expect(kindSets.length).toBeGreaterThan(0);
  for (const kinds of kindSets) expect(kinds).toContain('hn');

  await openFeed(page, '?tags=databases&kinds=hn');
  const combined = await cards(page).evaluateAll((elements) =>
    elements.map((element) => ({
      tags: [...element.querySelectorAll('[data-tag]')].map((tag) => tag.getAttribute('data-tag')),
      kinds: [...element.querySelectorAll('[data-source-kind]')].map((badge) =>
        badge.getAttribute('data-source-kind'),
      ),
    })),
  );
  expect(combined.length).toBeGreaterThan(0);
  for (const { tags, kinds } of combined) {
    expect(tags).toContain('databases');
    expect(kinds).toContain('hn');
  }
});

test('AC-1.3.4 search drives q and a 1-character query is not sent', async ({ page }) => {
  const feedQueries: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/feed')) feedQueries.push(request.url());
  });
  await openFeed(page);
  const search = page.getByRole('searchbox', { name: 'Search stories' });

  await search.fill('b');
  await expect(page).toHaveURL(/q=b$/);
  await page.waitForTimeout(500);
  expect(feedQueries.some((url) => url.includes('q='))).toBe(false);

  await search.fill('bun runtime');
  await expect(cards(page)).toHaveCount(1);
  expect(await cardTitles(page)).toEqual(['Bun runtime reaches production readiness']);
});

test('AC-1.3.5 scrolling loads every page once, without duplicate stories', async ({ page }) => {
  await openFeed(page);
  await expect(cards(page)).toHaveCount(20);
  await expect(async () => {
    await cards(page).last().scrollIntoViewIfNeeded();
    await expect(cards(page)).toHaveCount(TOP_STORY_COUNT, { timeout: 1000 });
  }).toPass();

  const ids = await cards(page).evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-story-id')),
  );
  expect(new Set(ids).size).toBe(TOP_STORY_COUNT);
  // The archive story is older than the Top window.
  expect(await cardTitles(page)).not.toContain('E2E story from the archive');
});

test('AC-1.3.6 filters, sort and search update the URL with replace and survive a reload', async ({
  page,
}) => {
  await openFeed(page);
  const historyLength = await page.evaluate(() => history.length);

  await page.getByRole('checkbox', { name: /^React\b/ }).check();
  await expect(page).toHaveURL(/tags=react/);
  await page.getByRole('checkbox', { name: /^Hacker News/ }).check();
  await expect(page).toHaveURL(/kinds=hn/);
  await page.getByRole('group', { name: 'Sort' }).getByRole('button', { name: 'Latest' }).click();
  await expect(page).toHaveURL(/sort=latest/);
  await page.getByRole('searchbox', { name: 'Search stories' }).fill('story');
  await expect(page).toHaveURL(/q=story/);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);

  const titles = await cardTitles(page);
  await page.reload();
  await page.waitForLoadState('networkidle');
  expect(await cardTitles(page)).toEqual(titles);
  await expect(page.getByRole('checkbox', { name: /^React\b/ })).toBeChecked();
  await expect(page.getByRole('searchbox', { name: 'Search stories' })).toHaveValue('story');

  await page.getByRole('group', { name: 'Sort' }).getByRole('button', { name: 'Top' }).click();
  await expect(page).not.toHaveURL(/sort=/);
});

test('AC-1.3.8 j and k move the active card and o and c open the story', async ({ page }) => {
  await page
    .context()
    .route(/\/\/(e2e|hn)\.example\.com\//, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>fixture</title>' }),
    );
  await openFeed(page, '?sort=latest');

  await expect(activeCard(page)).toHaveCount(0);
  await page.keyboard.press('j');
  await expect(activeCard(page)).toHaveAttribute('data-story-id', /^ce2e0*1$/);
  await page.keyboard.press('j');
  await expect(activeCard(page)).toHaveAttribute('data-story-id', /^ce2e0*2$/);
  await page.keyboard.press('k');
  await expect(activeCard(page)).toHaveAttribute('data-story-id', /^ce2e0*1$/);

  const originalPromise = page.context().waitForEvent('page');
  await page.keyboard.press('o');
  expect((await originalPromise).url()).toBe('https://e2e.example.com/ce2e00000001');

  const discussionPromise = page.context().waitForEvent('page');
  await page.keyboard.press('c');
  expect((await discussionPromise).url()).toBe('https://hn.example.com/ce2e00000001');
});

test('AC-1.3.8 / focuses search, t toggles the sort, Esc blurs, and typing ignores shortcuts', async ({
  page,
}) => {
  await openFeed(page);
  const search = page.getByRole('searchbox', { name: 'Search stories' });

  await page.keyboard.press('/');
  await expect(search).toBeFocused();
  await page.keyboard.type('jkt');
  await expect(search).toHaveValue('jkt');
  await expect(activeCard(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/sort=latest/);

  await page.keyboard.press('Escape');
  await expect(search).not.toBeFocused();

  // fill() focuses the box again, so blur it before the shortcut.
  await search.fill('');
  await expect(page).not.toHaveURL(/q=/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await expect(page).toHaveURL(/sort=latest/);
  await page.keyboard.press('t');
  await expect(page).not.toHaveURL(/sort=/);
});

test('AC-1.3.9 an empty result offers Clear filters', async ({ page }) => {
  await openFeed(page, '?q=zzzxqjvw');
  await expect(page.getByText('No stories match')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/q=/);
  await expect(cards(page)).toHaveCount(20);
});

test('AC-1.3.9 an API error shows Retry and recovers', async ({ page }) => {
  await openFeed(page);
  await page.route('**/api/v1/feed**', (route) => route.abort());
  await page.getByRole('group', { name: 'Sort' }).getByRole('button', { name: 'Latest' }).click();
  const retry = page.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeVisible({ timeout: 15_000 });

  await page.unroute('**/api/v1/feed**');
  await retry.click();
  await expect(cards(page)).toHaveCount(20);
});

test('AC-1.3.10 the story page shows its details and an unknown id gives a 404', async ({
  page,
}) => {
  await openFeed(page, '?sort=latest');
  const id = (await cards(page).first().getAttribute('data-story-id')) ?? '';

  const response = await page.goto(`/story/${id}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'E2E story 01' })).toBeVisible();
  await expect(page.getByText('Fixture story number 1.')).toBeVisible();
  await expect(page.getByText('e2e.example.com').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Discussed on' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Discussion/ })).toHaveAttribute(
    'href',
    'https://hn.example.com/ce2e00000001',
  );
  await expect(page.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-pressed', 'false');

  const missing = await page.goto('/story/cnotastoryxxxxxxxxxxxxxx');
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('AC-1.3.11 the sidebar lists tags with 7-day counts and sources with health dots', async ({
  page,
}) => {
  await openFeed(page);
  const sidebar = page.getByRole('complementary');
  await expect(sidebar.getByRole('checkbox', { name: /^React\b.*\d+$/ })).toBeVisible();
  for (const kind of ['hn', 'devto', 'rss', 'github']) {
    const row = sidebar.locator(`[data-kind="${kind}"]`);
    await expect(row.locator('[data-status="healthy"]')).toHaveAttribute('title', /^Last updated /);
  }
});

test('AC-1.3.13 focus makes a first-page card active and an unknown id is ignored', async ({
  page,
}) => {
  await openFeed(page);
  const id = (await cards(page).nth(5).getAttribute('data-story-id')) ?? '';

  await openFeed(page, `?focus=${id}`);
  await expect(activeCard(page)).toHaveAttribute('data-story-id', id);

  await openFeed(page, '?focus=cdoesnotexistxxxxxxxxxx');
  await expect(cards(page)).toHaveCount(20);
  await expect(activeCard(page)).toHaveCount(0);
});

test('AC-1.3.12 on mobile the filters sit in a bottom sheet and nothing scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openFeed(page);
  await expect(page.getByRole('complementary')).toBeHidden();

  await page.getByRole('button', { name: 'Filters' }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await sheet.getByRole('checkbox', { name: /^React\b/ }).check();
  await expect(page).toHaveURL(/tags=react/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Filters (1)' })).toBeVisible();

  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalScroll).toBe(false);
});

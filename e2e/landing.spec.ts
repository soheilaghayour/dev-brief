import { expect, test, type Locator, type Page } from '@playwright/test';

// The web build runs with the API up and the e2e stories seeded, so the landing page holds live stories.
const preview = (page: Page) => page.getByRole('group', { name: 'Live feed preview' });
const previewCards = (page: Page) => preview(page).locator('article[data-story-id]');

test('AC-L4 the landing page renders and the primary CTA reaches the feed without login', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your morning tech scan in 5 minutes' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Explore the feed — no login required' }).first().click();
  // AC-L4: Top is the default, so the URL carries no params.
  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.locator('article[data-story-id]').first()).toBeVisible();
  await expect(page.getByText('Sign in to DevBrief')).toHaveCount(0);
});

test('AC-L1 the initial HTML holds at least 6 story titles and no sample label', async ({
  page,
}) => {
  const html = await (await page.request.get('/')).text();
  expect(html.match(/data-story-id=/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  expect(html).not.toContain('Sample data');
  expect(html).toMatch(/\d+ stories today · \d+ sources?/);
});

test('AC-L5 clicking a card title opens its story page in the same tab', async ({ page }) => {
  await page.goto('/');
  const card = previewCards(page).nth(1);
  const id = await card.getAttribute('data-story-id');
  const title = card.getByRole('heading', { level: 2 }).getByRole('link');
  await expect(title).not.toHaveAttribute('target');
  await title.click();
  await expect(page).toHaveURL(`/story/${id}`);
  expect(page.context().pages()).toHaveLength(1);
});

const frame = (page: Page) => preview(page).locator('[data-preview-frame]');
const height = async (locator: Locator) => (await locator.boundingBox())!.height;

test('AC-L13 the server-rendered HTML holds all 30 embedded stories inside a vertically scrolling frame', async ({
  browser,
}) => {
  // Without JavaScript the page shows exactly what the server sent.
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(frame(page).locator('article[data-story-id]')).toHaveCount(30);
  expect(await frame(page).evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');
  expect(await frame(page).evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  await context.close();
});

test('AC-L13 the window and its frame keep their height for a chip, an empty list and the Briefing view', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const windowHeight = await height(preview(page));
  const frameHeight = await height(frame(page));

  await preview(page).getByRole('button', { name: 'Rust' }).click();
  await expect(preview(page).getByRole('button', { name: 'Rust' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await height(preview(page))).toBeCloseTo(windowHeight, 0);
  expect(await height(frame(page))).toBeCloseTo(frameHeight, 0);

  await preview(page).getByRole('button', { name: 'Briefing' }).click();
  await expect(preview(page).getByRole('heading', { level: 2, name: /^Example 1:/ })).toBeVisible();
  expect(await height(preview(page))).toBeCloseTo(windowHeight, 0);

  await preview(page).getByRole('button', { name: 'Feed' }).click();
  await expect(previewCards(page).first()).toBeVisible();
  // Every chip has seeded stories, so the empty result is staged last: the cards give way to a one-line message.
  await frame(page).evaluate((element) => {
    element.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'None' }));
  });
  expect(await height(preview(page))).toBeCloseTo(windowHeight, 0);
  expect(await height(frame(page))).toBeCloseTo(frameHeight, 0);
});

test('AC-L12 from md up the hero is two columns, 45% text on the left and 55% window', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const textBox = (await page.locator('[data-hero-column="text"]').boundingBox())!;
  const windowBox = (await page.locator('[data-hero-column="preview"]').boundingBox())!;
  expect(textBox.x + textBox.width).toBeLessThanOrEqual(windowBox.x);
  expect(Math.abs(textBox.y - windowBox.y)).toBeLessThan(windowBox.height);
  expect(textBox.width / (textBox.width + windowBox.width)).toBeCloseTo(0.45, 2);
  expect(
    await page.locator('#hero-title').evaluate((element) => getComputedStyle(element).textAlign),
  ).toMatch(/^(left|start)$/);
});

test('AC-L12 at 360 px the text comes first, the window below it, and nothing scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  const textBox = (await page.locator('[data-hero-column="text"]').boundingBox())!;
  const windowBox = (await page.locator('[data-hero-column="preview"]').boundingBox())!;
  expect(textBox.y + textBox.height).toBeLessThanOrEqual(windowBox.y);
  expect(windowBox.x + windowBox.width).toBeLessThanOrEqual(360);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('AC-L12 at 360 px a 40-character unbreakable title and domain do not scroll the page sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.evaluate(() => {
    const card = document.querySelector('[data-hero-column="preview"] article[data-story-id]')!;
    card.querySelector('h2 a')!.textContent = 'x'.repeat(40);
    card.querySelector('h2 span')!.textContent = 'y'.repeat(40);
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('AC-L13 at 320 px the footer keeps its height between the Feed and Briefing views', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const footer = preview(page).locator(':scope > div').last();
  const feedHeight = await height(footer);
  await preview(page).getByRole('button', { name: 'Briefing' }).click();
  await expect(preview(page).getByRole('heading', { level: 2, name: /^Example 1:/ })).toBeVisible();
  expect(await height(footer)).toBeCloseTo(feedHeight, 0);
});

test('a card’s Save button saves to the guest store and the feed shows it saved', async ({
  page,
}) => {
  await page.goto('/');
  // The guest store loads after hydration; the marker says the buttons are wired.
  await expect(preview(page)).toHaveAttribute('data-saves-ready', 'true');
  const firstId = await previewCards(page).first().getAttribute('data-story-id');
  const save = previewCards(page).first().getByRole('button', { name: 'Save story' });
  await save.click();
  await expect(save).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/feed');
  await expect(
    page.locator(`article[data-story-id="${firstId}"]`).getByRole('button', { name: 'Save story' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('a tag chip filters the preview list on the client', async ({ page }) => {
  await page.goto('/');
  await preview(page).getByRole('button', { name: 'TypeScript' }).click();
  await expect(preview(page).getByRole('button', { name: 'TypeScript' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const tags = await previewCards(page).evaluateAll((cards) => cards.length);
  expect(tags).toBeGreaterThan(0);
});

test('AC-L6 renders dark on first paint for a dark OS and keeps a chosen theme across reloads', async ({
  page,
}) => {
  // The class at DOMContentLoaded is the first paint's; after `load` the theme script has long run.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      Reflect.set(window, 'firstPaintClass', document.documentElement.className);
    });
  });
  const firstPaintClass = () =>
    page.evaluate(() => Reflect.get(window, 'firstPaintClass') as string);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  expect(await firstPaintClass()).toContain('dark');

  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.reload();
  expect(await firstPaintClass()).not.toContain('dark');
});

test('AC-L7 the nav and the bento tile show Radar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([
    'Feed',
    'Radar',
    'GitHub',
  ]);
  await expect(page.getByRole('heading', { name: 'Tech Radar' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Radar' }).click();
  await expect(page).toHaveURL('/radar');
});

test('AC-L8 the footer links to the statically rendered Impressum and Privacy pages', async ({
  page,
}) => {
  await page.goto('/');
  for (const [name, path] of [
    ['Impressum', '/impressum'],
    ['Privacy (Datenschutz)', '/privacy'],
  ] as const) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('s-maxage');
    await page.getByRole('contentinfo').getByRole('link', { name }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByText('Placeholder — replace before public launch')).toBeVisible();
    await page.goBack();
  }
});

test('AC-L9 the page has a title, description, canonical URL, Open Graph and Twitter tags and an OG image', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/DevBrief/);
  for (const selector of [
    'meta[name="description"]',
    'link[rel="canonical"]',
    'meta[property="og:title"]',
    'meta[property="og:image"]',
    'meta[name="twitter:card"]',
  ]) {
    await expect(page.locator(selector)).toHaveCount(1);
  }
  const imageUrl = await page.locator('meta[property="og:image"]').getAttribute('content');
  const image = await page.request.get(new URL(imageUrl ?? '').pathname);
  expect(image.headers()['content-type']).toBe('image/png');
});

test('AC-L10 no looping animation runs with prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page
    .getByRole('heading', { name: 'Built for the way engineers read' })
    .scrollIntoViewIfNeeded();
  const loopingCount = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations === Infinity)
        .length,
  );
  expect(loopingCount).toBe(0);
});

const EXAMPLE_QUESTIONS = [
  "What were this week's TypeScript tooling debates?",
  'What were the biggest AI tooling launches this week?',
  'Rust vs Go: what are teams choosing this week?',
];
const exampleSection = (page: Page) =>
  page.getByRole('region', { name: 'Ask a question, get a briefing' });

// The renderer is the only chunk that holds @a2ui/react (the size gate's marker).
function watchRequests(page: Page) {
  const seen = { renderer: false, copilotCalls: [] as string[] };
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/v1/copilot/'))
      seen.copilotCalls.push(request.url());
  });
  page.on('response', async (response) => {
    if (!response.url().includes('/_next/static/') || !response.url().endsWith('.js')) return;
    const body = await response.text().catch(() => '');
    if (/a2ui-react-/.test(body)) seen.renderer = true;
  });
  return seen;
}

test('AC-3.2.2 the initial HTML holds the three question tabs; the renderer loads and no copilot call happens only once the section scrolls into view', async ({
  page,
}) => {
  const html = await (await page.request.get('/')).text();
  for (const question of EXAMPLE_QUESTIONS) expect(html).toContain(question.replace("'", '&#x27;'));

  const seen = watchRequests(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(seen.renderer).toBe(false);

  await exampleSection(page).scrollIntoViewIfNeeded();
  await expect(
    exampleSection(page).getByRole('heading', {
      level: 2,
      name: `Example 1: ${EXAMPLE_QUESTIONS[0]}`,
    }),
  ).toBeVisible();
  // The response handler is async, so the flag lands a moment after the heading shows.
  await expect.poll(() => seen.renderer).toBe(true);
  expect(seen.copilotCalls).toEqual([]);
});

test('AC-3.2.2 focus stays on a tab and the arrows work when the live tabs replace the server-rendered ones', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Every script requested from here on is the lazy chunk or its dependencies: hold them until released.
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  let heldCount = 0;
  await page.route(/\/_next\/static\/.*\.js/, async (route) => {
    heldCount += 1;
    await released;
    await route.continue();
  });
  await exampleSection(page).scrollIntoViewIfNeeded();
  const tabs = exampleSection(page).getByRole('tab');
  await tabs.first().focus();
  await expect.poll(() => heldCount).toBeGreaterThan(0);
  await expect(tabs.first()).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();

  release();
  await expect(
    exampleSection(page).getByRole('tabpanel').getByRole('heading', { level: 2 }),
  ).toContainText('Example 2:');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(2)).toBeFocused();
});

test('AC-3.2.2 the example section shows briefing #1 with a story card and switches tabs', async ({
  page,
}) => {
  await page.goto('/');
  await exampleSection(page).scrollIntoViewIfNeeded();
  const panel = exampleSection(page).getByRole('tabpanel');
  await expect(panel.getByRole('heading', { level: 2, name: /^Example 1:/ })).toBeVisible();
  await expect(panel.locator('article').first()).toBeVisible();

  await exampleSection(page).getByRole('tab', { name: EXAMPLE_QUESTIONS[1] }).click();
  await expect(panel.getByRole('heading', { level: 2, name: /^Example 2:/ })).toBeVisible();
});

test('the example tabs move with the arrow keys', async ({ page }) => {
  await page.goto('/');
  await exampleSection(page).scrollIntoViewIfNeeded();
  const tabs = exampleSection(page).getByRole('tab');
  // The live tabs replace the server-rendered ones; only they react to keys.
  await expect(
    exampleSection(page).getByRole('tabpanel').getByRole('heading', { level: 2 }),
  ).toBeVisible();
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toBeFocused();
});

test("AC-3.2.2 the hero's Briefing control shows example #1 and Feed brings the stories back", async ({
  page,
}) => {
  const seen = watchRequests(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(seen.renderer).toBe(false);

  const feedHeight = (await preview(page).boundingBox())!.height;
  await preview(page).getByRole('button', { name: 'Briefing' }).click();
  await expect(
    preview(page).getByRole('heading', { level: 2, name: `Example 1: ${EXAMPLE_QUESTIONS[0]}` }),
  ).toBeVisible();
  expect(seen.copilotCalls).toEqual([]);
  // The window keeps its height, so the page below doesn't jump.
  expect((await preview(page).boundingBox())!.height).toBeCloseTo(feedHeight, 0);

  await preview(page).getByRole('button', { name: 'Feed' }).click();
  await expect(previewCards(page).first()).toBeVisible();
});

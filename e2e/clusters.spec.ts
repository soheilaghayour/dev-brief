import { expect, test } from '@playwright/test';

// Fixed ids from apps/api/prisma/seedE2e.ts: an HN representative, a Dev.to member and a blog member.
const REPRESENTATIVE = 'ce2e00000047';
const DEVTO_MEMBER = 'ce2e00000048';
const BLOG_MEMBER = 'ce2e00000049';

test('AC-2.2.1 the feed shows one card for the cluster, with the combined line and "+2 related"', async ({
  page,
}) => {
  await page.goto('/feed?q=zephyr');
  await page.waitForLoadState('networkidle');

  const cards = page.locator('article[data-story-id]');
  await expect(cards).toHaveCount(1);
  const card = cards.first();
  await expect(card).toHaveAttribute('data-story-id', REPRESENTATIVE);
  await expect(card).toContainText(
    /Trending on HN \(▲ \d+ points\) & Dev\.to \(♥ \d+ reactions\) · 1 blog/,
  );
  await expect(card.getByRole('button', { name: /\+2 related/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('AC-2.2.1 expanding lists both other members inline without changing the URL', async ({
  page,
}) => {
  await page.goto('/feed?q=zephyr');
  await page.waitForLoadState('networkidle');
  const url = page.url();

  const card = page.locator(`article[data-story-id="${REPRESENTATIVE}"]`);
  const toggle = card.getByRole('button', { name: /\+2 related/ });
  await toggle.click();

  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByRole('link', { name: 'Hands-on with the Zephyr runtime' })).toBeVisible();
  await expect(card.getByRole('link', { name: 'Why we moved to Zephyr' })).toBeVisible();
  expect(page.url()).toBe(url);
});

test('AC-2.2.2 a related story opens its page with all three members under "Related coverage"', async ({
  page,
}) => {
  await page.goto('/feed?q=zephyr');
  await page.waitForLoadState('networkidle');
  const card = page.locator(`article[data-story-id="${REPRESENTATIVE}"]`);
  await card.getByRole('button', { name: /\+2 related/ }).click();

  await card.getByRole('link', { name: 'Hands-on with the Zephyr runtime' }).click();

  await expect(page).toHaveURL(new RegExp(`/story/${DEVTO_MEMBER}$`));
  const related = page.getByRole('region', { name: 'Related coverage' });
  await expect(related.getByRole('listitem')).toHaveCount(3);
  await expect(related).toContainText('This story');
  await expect(related.getByRole('link', { name: 'Zephyr runtime lands in stable' })).toBeVisible();
  await expect(related.getByRole('link', { name: 'Why we moved to Zephyr' })).toHaveAttribute(
    'href',
    `/story/${BLOG_MEMBER}`,
  );
});

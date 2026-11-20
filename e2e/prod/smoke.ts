import { expect, test } from '@playwright/test';

// Public flows only: signed-in flows need AUTH_TEST_MODE, which production refuses, so CI covers them.
// §8.6 headers as name → expected fragment (the CSP only needs its base directive here).
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'",
  'strict-transport-security': 'max-age=',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=()',
};
const FEED_TTFB_BUDGET_MS = 400;

test('production health is ok', async ({ request }) => {
  const response = await request.get('/api/v1/health');
  expect(response.status()).toBe(200);
  const health = await response.json();
  expect(health.db).toBe('ok');
  expect(['ok', 'degraded']).toContain(health.status);
  // "dev" or "unknown" means the deploy did not get SOURCE_COMMIT, so Sentry would tag errors with no release.
  expect(['dev', 'unknown']).not.toContain(health.version);
});

test('the landing page renders', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Developer news, minus the noise.' }),
  ).toBeVisible();
});

test('the guest feed renders stories', async ({ page }) => {
  await page.goto('/feed');
  await expect(page.locator('article[data-story-id]').first()).toBeVisible();
});

for (const path of ['/', '/api/v1/health']) {
  test(`security headers are present on ${path}`, async ({ request }) => {
    const headers = (await request.get(path)).headers();
    for (const [name, fragment] of Object.entries(SECURITY_HEADERS)) {
      expect(headers[name], name).toContain(fragment);
    }
  });
}

test('/feed server-renders within the TTFB budget', async ({ page }) => {
  // The first navigation warms the connection and the API cache; the median of the next three is measured.
  await page.goto('/feed');
  const samples: number[] = [];
  for (let run = 0; run < 3; run++) {
    await page.goto('/feed');
    samples.push(
      await page.evaluate(() => {
        const [navigation] = performance.getEntriesByType('navigation');
        const { requestStart, responseStart } = navigation as PerformanceNavigationTiming;
        return responseStart - requestStart;
      }),
    );
  }
  samples.sort((a, b) => a - b);
  expect(samples[1]).toBeLessThanOrEqual(FEED_TTFB_BUDGET_MS);
});

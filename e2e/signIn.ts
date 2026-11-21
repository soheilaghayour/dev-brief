import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const MAX_ATTEMPTS = 3;

/**
 * Signs in through the test-mode route (needs AUTH_TEST_MODE=true on the API); the same email is the same user, a new one a fresh user.
 * /api/auth/* allows 10 requests a minute per IP (§8.6) and the suite's sign-ins come close, so a 429 waits for its Retry-After instead of failing the test.
 */
export async function signInThroughTestRoute(page: Page, email = `${randomUUID()}@example.com`) {
  const origin = new URL(process.env.APP_URL ?? 'http://localhost:3000').origin;
  for (let attempt = 1; ; attempt += 1) {
    // The Origin header passes Better Auth's CSRF check.
    const response = await page.request.post('/api/auth/test/sign-in', {
      headers: { Origin: origin },
      data: { email },
    });
    if (response.status() !== 429 || attempt === MAX_ATTEMPTS) {
      expect(response.ok()).toBe(true);
      return email;
    }
    const waitMs = (Number(response.headers()['retry-after']) || 60) * 1000;
    test.info().setTimeout(test.info().timeout + waitMs);
    await page.waitForTimeout(waitMs);
  }
}

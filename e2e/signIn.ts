import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

/**
 * Signs in through the test-mode route (needs AUTH_TEST_MODE=true on the API); the same email is the same user, a new one a fresh user.
 * The config's internal-token header exempts these requests from the /api/auth/* limit, but only on a test-mode API.
 */
export async function signInThroughTestRoute(page: Page, email = `${randomUUID()}@example.com`) {
  const origin = new URL(process.env.APP_URL ?? 'http://localhost:3000').origin;
  // The Origin header passes Better Auth's CSRF check.
  const response = await page.request.post('/api/auth/test/sign-in', {
    headers: { Origin: origin },
    data: { email },
  });
  expect(response.ok()).toBe(true);
  return email;
}

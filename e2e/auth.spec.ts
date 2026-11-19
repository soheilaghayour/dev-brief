import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const APP_URL = 'http://localhost:3000';
// The guest store's key (`GUEST_STORAGE_KEY` in apps/web/src/lib/guest/clear.ts).
const GUEST_STORAGE_KEY = 'devbrief:guest:v1';

// The test-mode route needs AUTH_TEST_MODE=true on the API; the Origin header passes Better Auth's CSRF check.
async function signInThroughTestRoute(page: Page) {
  const response = await page.request.post(`${APP_URL}/api/auth/test/sign-in`, {
    headers: { Origin: APP_URL },
    // A fresh user per test: the delete-account test must not remove the user another test is using.
    data: { email: `${randomUUID()}@example.com` },
  });
  expect(response.ok()).toBe(true);
}

test('AC-1.5.1 /sign-in offers GitHub and Google and nothing else', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('button')).toHaveCount(2);
  await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);
});

test('a guest sees Sign in, which keeps the current URL as callbackURL', async ({ page }) => {
  await page.goto('/feed?sort=latest');
  await page.getByRole('banner').getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2Ffeed%3Fsort%3Dlatest$/);
  // On /sign-in the header button would nest this callbackURL inside a new one.
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toHaveCount(0);
});

const SOCIAL_SIGN_IN = '**/api/auth/sign-in/social';

// Stops the click at Better Auth's sign-in call and returns the body the page sent.
async function socialSignInBody(page: Page, signInUrl: string) {
  await page.route(SOCIAL_SIGN_IN, (route) => route.abort());
  await page.goto(signInUrl);
  const [request] = await Promise.all([
    page.waitForRequest(SOCIAL_SIGN_IN),
    page.getByRole('button', { name: 'Continue with GitHub' }).click(),
  ]);
  return request.postDataJSON() as unknown;
}

test('AC-1.5.2 sign-in passes a same-origin callbackURL to OAuth and replaces an external one', async ({
  page,
}) => {
  expect(
    await socialSignInBody(page, '/sign-in?callbackURL=%2Ffeed%3Fsort%3Dlatest'),
  ).toMatchObject({
    provider: 'github',
    callbackURL: '/feed?sort=latest',
    errorCallbackURL: '/sign-in?callbackURL=%2Ffeed%3Fsort%3Dlatest',
  });
  expect(
    await socialSignInBody(page, '/sign-in?callbackURL=https%3A%2F%2Fevil.example'),
  ).toMatchObject({ callbackURL: '/feed' });
});

test('a sign-in that failed at the provider explains why on /sign-in', async ({ page }) => {
  await page.goto('/sign-in?error=email_not_verified');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(/Verify your email/);
});

test('sign-in via the test-mode route shows the user menu', async ({ page }) => {
  await signInThroughTestRoute(page);
  await page.goto('/feed');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('menu').getByText('Test User')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
});

test('AC-1.5.8 signing out returns the app to guest mode with an empty local store', async ({
  page,
}) => {
  await signInThroughTestRoute(page);
  await page.goto('/feed');
  await page.evaluate((key) => localStorage.setItem(key, '{}'), GUEST_STORAGE_KEY);
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), GUEST_STORAGE_KEY)).toBeNull();
});

test('AC-1.6.2 deleting the account needs the word delete, then returns to the landing page', async ({
  page,
}) => {
  await signInThroughTestRoute(page);
  await page.goto('/settings');
  const openDialog = page.getByRole('button', { name: 'Delete account…' });
  const confirm = page.getByRole('button', { name: 'Delete my account' });
  await openDialog.click();
  await page.getByLabel('Type delete to confirm').fill('delete');
  // Closing disarms the dialog: a reopened one needs the word again.
  await page.keyboard.press('Escape');
  await openDialog.click();
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Type delete to confirm').fill('delete');
  await confirm.click();
  await expect(page).toHaveURL(`${APP_URL}/`);
  await expect(page.getByText('Your account was deleted.')).toBeVisible();
});

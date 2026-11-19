import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const APP_URL = 'http://localhost:3000';

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
});

test('sign-in via the test-mode route shows the user menu', async ({ page }) => {
  await signInThroughTestRoute(page);
  await page.goto('/feed');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('menu').getByText('Test User')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
});

test('AC-1.5.8 signing out returns the app to guest mode', async ({ page }) => {
  await signInThroughTestRoute(page);
  await page.goto('/feed');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('AC-1.6.2 deleting the account needs the word delete, then returns to the landing page', async ({
  page,
}) => {
  await signInThroughTestRoute(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete account…' }).click();
  const confirm = page.getByRole('button', { name: 'Delete my account' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Type delete to confirm').fill('delete');
  await confirm.click();
  await expect(page).toHaveURL(`${APP_URL}/`);
});

import { expect, test, type Page } from '@playwright/test';
import { signInThroughTestRoute } from './signIn';

const APP_URL = 'http://localhost:3000';
// The guest store's key (`GUEST_STORAGE_KEY` in apps/web/src/lib/guest/clear.ts).
const GUEST_STORAGE_KEY = 'devbrief:guest:v1';

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

test('a signed-in user does not see the guest hint', async ({ page }) => {
  await signInThroughTestRoute(page);
  await page.goto('/feed');
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('region', { name: 'Guest hint' })).toHaveCount(0);
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

test('AC-1.5.5 AC-1.5.7 a guest save is merged on sign-in, then read from the server on /saved', async ({
  page,
}) => {
  await page.goto('/feed?sort=latest');
  await page.waitForLoadState('networkidle');
  const card = page.locator('article[data-story-id]').first();
  const id = (await card.getAttribute('data-story-id')) ?? '';
  const title = (await card.locator('h2 a').textContent()) ?? '';
  await card.getByRole('button', { name: 'Save story' }).click();
  await expect(card.getByRole('button', { name: 'Save story' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  let merges = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/me/merge')) merges += 1;
  });
  await signInThroughTestRoute(page);
  await page.goto('/feed?sort=latest');

  await expect(page.getByText('1 saved story synced')).toBeVisible();
  expect(merges).toBe(1);
  const stored = await page.evaluate((key) => localStorage.getItem(key), GUEST_STORAGE_KEY);
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ saves: [], pendingMerge: false });
  await expect(
    page.locator(`article[data-story-id="${id}"]`).getByRole('button', { name: 'Save story' }),
  ).toHaveAttribute('aria-pressed', 'true');

  // The device no longer holds the save, so the page can only get it from GET /me/saves.
  await page.getByRole('link', { name: 'Saved' }).first().click();
  await expect(page).toHaveURL(/\/saved$/);
  await expect(page.locator('article[data-story-id]')).toHaveCount(1);
  await expect(page.locator('article[data-story-id] h2 a')).toHaveText(title);
});

test('AC-1.5.6 a failed merge keeps the local saves and retries on the next load', async ({
  page,
}) => {
  await page.goto('/feed?sort=latest');
  await page.waitForLoadState('networkidle');
  const card = page.locator('article[data-story-id]').first();
  await card.getByRole('button', { name: 'Save story' }).click();

  let mergeCalls = 0;
  await page.route('**/api/v1/me/merge', (route) => {
    mergeCalls += 1;
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'INTERNAL', message: 'x', requestId: 'r' } }),
    });
  });
  await signInThroughTestRoute(page);
  await page.goto('/feed?sort=latest');
  await expect.poll(() => mergeCalls).toBe(1);
  const kept = await page.evaluate((key) => localStorage.getItem(key), GUEST_STORAGE_KEY);
  expect(JSON.parse(kept ?? '{}')).toMatchObject({
    pendingMerge: true,
    saves: [expect.any(Object)],
  });
  await expect(page.getByText(/saved stor(y|ies) synced/)).toHaveCount(0);

  await page.unroute('**/api/v1/me/merge');
  await page.reload();
  await expect(page.getByText('1 saved story synced')).toBeVisible();
  const cleared = await page.evaluate((key) => localStorage.getItem(key), GUEST_STORAGE_KEY);
  expect(JSON.parse(cleared ?? '{}')).toMatchObject({ saves: [], pendingMerge: false });
});

test('AC-1.5.4 a signed-in user unsaves on /saved and the save stays gone after a reload', async ({
  page,
}) => {
  await signInThroughTestRoute(page);
  await page.goto('/feed?sort=latest');
  await page.waitForLoadState('networkidle');
  const save = page
    .locator('article[data-story-id]')
    .first()
    .getByRole('button', { name: 'Save story' });
  await save.click();
  await expect(save).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/saved');
  const cards = page.locator('article[data-story-id]');
  await expect(cards).toHaveCount(1);
  await cards.first().getByRole('button', { name: 'Save story' }).click();
  await expect(cards).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Nothing saved yet')).toBeVisible();
});

import { expect, test, type Locator } from '@playwright/test';

// Needs the API's and the web build's FEATURE_COPILOT on, as in CI's e2e run: the Ask button is absent without it.
const cursorOf = (control: Locator) =>
  control.evaluate((element) => getComputedStyle(element).cursor);

test('every enabled control on the feed shows the pointer cursor', async ({ page }) => {
  await page.goto('/feed');
  await expect(page.locator('html[data-hotkeys-ready]')).toBeAttached();
  const header = page.getByRole('banner');
  const controls = {
    ask: header.getByRole('button', { name: /^Ask/ }),
    theme: header.getByRole('radio').first(),
    signIn: header.getByRole('button', { name: 'Sign in' }),
    tagRow: page.getByRole('complementary').locator('label').first(),
    save: page.getByRole('button', { name: 'Save story' }).first(),
  };
  for (const [name, control] of Object.entries(controls)) {
    await expect(control, name).toBeVisible();
    expect(await cursorOf(control), name).toBe('pointer');
  }
});

test('a disabled button does not show the pointer cursor', async ({ page }) => {
  await page.goto('/feed');
  await expect(page.locator('html[data-hotkeys-ready]')).toBeAttached();
  await page.getByRole('banner').getByRole('button', { name: /^Ask/ }).click();
  // The empty question leaves the bar's own Ask button disabled.
  const submit = page
    .getByRole('dialog', { name: 'Ask the News' })
    .getByRole('button', { name: 'Ask' });
  await expect(submit).toBeDisabled();
  expect(await cursorOf(submit)).not.toBe('pointer');
});

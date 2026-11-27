import { expect, test, type Locator } from '@playwright/test';

const cursorOf = (control: Locator) =>
  control.evaluate((element) => getComputedStyle(element).cursor);

test('every enabled control on the feed shows the pointer cursor', async ({ page }) => {
  await page.goto('/feed');
  const header = page.getByRole('banner');
  const controls = {
    // The Ask button is absent unless FEATURE_COPILOT is on for the API and the web build, as in CI's e2e run.
    ask: header.getByRole('button', { name: /^Ask\b/ }),
    theme: header.getByRole('radio').first(),
    signIn: header.getByRole('button', { name: 'Sign in' }),
    tagRow: page.getByRole('group', { name: /^Tags/ }).locator('label').first(),
    save: page.getByRole('button', { name: 'Save story' }).first(),
  };
  for (const [name, control] of Object.entries(controls)) {
    await expect(control, name).toBeVisible();
    expect(await cursorOf(control), name).toBe('pointer');
  }
});

test('a disabled button does not show the pointer cursor', async ({ page }) => {
  await page.goto('/feed');
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Ask\b/ })
    .click();
  // The empty question leaves the bar's own Ask button disabled.
  const submit = page
    .getByRole('dialog', { name: 'Ask the News' })
    .getByRole('button', { name: 'Ask', exact: true });
  await expect(submit).toBeDisabled();
  expect(await cursorOf(submit)).not.toBe('pointer');
});

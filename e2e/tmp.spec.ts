import { test } from '@playwright/test';

test('idle', async ({ page }) => {
  const pending = new Map<string, number>();
  page.on('request', (r) => pending.set(r.url(), Date.now()));
  page.on('requestfinished', (r) => pending.delete(r.url()));
  page.on('requestfailed', (r) => pending.delete(r.url()));
  await page.goto('http://localhost:3100/feed');
  await page.waitForTimeout(6000);
  console.log('PENDING', JSON.stringify([...pending.keys()]));
  await page.waitForLoadState('networkidle', { timeout: 10000 }).then(
    () => console.log('IDLE'),
    () => console.log('NOT IDLE'),
  );
});

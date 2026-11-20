import { test } from '@playwright/test';

test('debug idle', async ({ page }) => {
  const pending = new Map<string, number>();
  const log: string[] = [];
  page.on('request', (r) => pending.set(r.url(), Date.now()));
  page.on('requestfinished', (r) => {
    log.push(`${Date.now() - (pending.get(r.url()) ?? 0)}ms ${r.url().slice(-70)}`);
    pending.delete(r.url());
  });
  page.on('requestfailed', (r) => {
    log.push(`FAILED ${r.url().slice(-70)} ${r.failure()?.errorText}`);
    pending.delete(r.url());
  });
  await page.goto('/feed');
  await page.waitForTimeout(10000);
  throw new Error(`DEBUG-PENDING ${JSON.stringify([...pending.keys()])} DEBUG-LOG ${JSON.stringify(log)}`);
});

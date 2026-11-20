import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'tmp.spec.ts',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

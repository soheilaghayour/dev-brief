import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.SMOKE_BASE_URL;
if (!baseURL) throw new Error('Set SMOKE_BASE_URL, e.g. SMOKE_BASE_URL=https://devbrief.example');

// Runs against a deployed site; it starts no servers and needs no secrets.
export default defineConfig({
  testDir: './prod',
  testMatch: 'smoke.ts',
  retries: 1,
  reporter: 'list',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

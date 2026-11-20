import { defineConfig, devices } from '@playwright/test';

const WEB_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001';

// Runs against the built apps (`API_PROXY_URL=http://localhost:3001 pnpm build` first); the environment comes from the caller or .env.example.
export default defineConfig({
  testDir: '.',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    // Browser calls skip the per-IP rate limit like the web server's own: one test run is one "visitor".
    extraHTTPHeaders: { 'x-internal-token': process.env.INTERNAL_API_TOKEN ?? '' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter api start',
      // Registers the test-only sign-in route for this run alone.
      env: { AUTH_TEST_MODE: 'true' },
      url: `${API_URL}/api/v1/health`,
      // CI starts the API before the web build, which generates the landing page from its data.
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter web start',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});

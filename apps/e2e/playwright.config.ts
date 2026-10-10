import { defineConfig, devices } from '@playwright/test';

const API_URL = 'http://localhost:4010/api';
const WEB_URL = 'http://localhost:5180';

// Real installed Chrome, so no browser download is needed. Set E2E_CHANNEL=msedge to use Edge.
const channel = process.env.E2E_CHANNEL ?? 'chrome';

export default defineConfig({
  testDir: './tests',
  outputDir: './results/artifacts',
  reporter: [['list'], ['json', { outputFile: 'results/report.json' }], ['html', { outputFolder: 'results/html', open: 'never' }]],
  // Tests share one backend and reset it, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: WEB_URL,
    channel,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // A fresh browser profile per test, so stored settings and sessions never leak between tests.
    storageState: undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 820, height: 1100 }, hasTouch: true } },
    {
      name: 'phone',
      // iPhone-sized and touch, but still Chromium (WebKit is not installed).
      use: { ...devices['Desktop Chrome'], channel, viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
  webServer: [
    {
      command: 'npx tsx server.ts',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
    },
    {
      // A production build (so the service worker and manifest are real) pointed at the test API.
      // Built into its own folder so the normal dist/ is never overwritten.
      command: 'npm run build:e2e --workspace apps/web && npm run preview:e2e --workspace apps/web',
      cwd: '../..',
      env: { VITE_API_BASE_URL: API_URL },
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 240_000,
      stdout: 'pipe',
    },
  ],
});

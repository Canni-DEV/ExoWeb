import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 30000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174/ExoWeb/',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    channel: process.env.GPU_TESTS === '1' ? 'chromium' : undefined,
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4174',
    url: 'http://127.0.0.1:4174/ExoWeb/',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

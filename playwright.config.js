import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 1,
  workers: 1, // Extensions need serial execution

  use: {
    headless: false, // Extensions require headed mode
    viewport: { width: 1280, height: 800 },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: [
            `--disable-extensions-except=${path.resolve('.')}`,
            `--load-extension=${path.resolve('.')}`,
            '--no-first-run',
            '--disable-default-apps',
          ],
        },
      },
    },
  ],

  // Start mock servers before tests
  webServer: [
    {
      command: 'node tests/e2e/mocks/claude-server.js',
      port: 3100,
      reuseExistingServer: true,
    },
    {
      command: 'node tests/e2e/mocks/n8n-server.js',
      port: 5678,
      reuseExistingServer: true,
    },
  ],
});

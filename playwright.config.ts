import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  webServer: {
    command: 'node e2e/serve.mjs 4173',
    port: 4173,
    reuseExistingServer: false,
  },
});

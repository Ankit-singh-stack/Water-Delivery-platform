import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 600000,
  retries: 0,
  workers: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 900 },
    baseURL: 'http://localhost:5174',
    actionTimeout: 15000,
    navigationTimeout: 20000,
  },
})

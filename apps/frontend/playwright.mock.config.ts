import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/auth.spec.ts'],
  fullyParallel: false,
  // Vite コールドスタート時に最初の button click が失敗することがある (PBI-018)
  // retries: 1 で初回失敗をリカバリする
  retries: 1,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev:mock',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 60000,
  },
})

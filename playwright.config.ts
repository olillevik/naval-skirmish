import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173/naval-skirmish/',
  },
  // Each project runs the spec file with its name, so a test only runs on the viewport it is written for.
  projects: [
    { name: 'desktop', testMatch: 'desktop.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone-landscape', testMatch: 'phone-landscape.spec.ts', use: { ...devices['Pixel 7 landscape'] } },
    { name: 'phone-upright', testMatch: 'phone-upright.spec.ts', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/naval-skirmish/',
    reuseExistingServer: !process.env.CI,
  },
});

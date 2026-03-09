import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './test/e2e',
    timeout: 30000,
    retries: 1,
    reporter: [
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ],
    use: {
        baseURL: 'http://localhost:3001',
        headless: true,
        screenshot: 'only-on-failure',
        trace: 'on-first-retry',
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
    ],
});

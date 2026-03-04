import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './test/e2e',
    timeout: 30000,
    retries: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:3001',
        headless: true,
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } }
    ],
});

import { test, expect } from '@playwright/test';

test.describe('Premium Dashboard E2E', () => {

    test.beforeEach(async ({ page }) => {
        page.on('console', msg => console.log(`BROWSER-CONSOLE: ${msg.type()}: ${msg.text()}`));
        page.on('pageerror', err => console.log(`BROWSER-ERROR: ${err.message}`));
        page.on('requestfailed', request => console.log(`REQUEST-FAILED: ${request.url()} - ${request.failure()?.errorText}`));

        // Mock Auth
        await page.route('**/api/auth/me', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    accessToken: "mock-token",
                    user: { name: "Test User", email: "test@example.com", picture: "https://api.dicebear.com/7.x/avataaars/svg?seed=John" }
                })
            });
        });

        await page.route('**/api/auth/refresh', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    accessToken: "mock-token-refreshed"
                })
            });
        });

        // Mock the main API endpoints
        await page.route('**/api/stats', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    totalPnL: 125.456,
                    winRate: "78.5",
                    totalPositions: 150,
                    activePositions: 5
                })
            });
        });

        await page.route('**/api/agent/stats', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    enabled: true,
                    mode: "SIMULATION",
                    confidence: 85
                })
            });
        });

        await page.route('**/api/agent/trades', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    { token: "ABC", pnl: 0.5, timestamp: Date.now() - 3600000, status: "closed" },
                    { token: "DEF", pnl: -0.2, timestamp: Date.now() - 7200000, status: "closed" }
                ])
            });
        });

        await page.route('**/api/agent/logs', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    { message: "Bot started", type: "info", time: Date.now() },
                    { message: "Scanning for opportunities", type: "info", time: Date.now() - 1000 }
                ])
            });
        });

        await page.route('**/api/positions', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    { mint: "Mint1234567890", pnl: 0.05, pnl_percent: 5.2, entryTime: Date.now() - 1800000, size_sol: 1.0 }
                ])
            });
        });

        await page.route('**/api/trading-config', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    agentMinConfidence: 75
                })
            });
        });

        await page.route('**/api/simulation/status', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    mode: "SIMULATION",
                    metrics: { totalPnL: 125.456 }
                })
            });
        });

        await page.route('**/api/simulation/trades*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([])
            });
        });

        // Navigate to the premium dashboard
        // We expect the app to be served from http://localhost:3001
        await page.goto('/premium');
    });

    test.afterEach(async ({ page }, testInfo) => {
        if (testInfo.status !== testInfo.expectedStatus) {
            const screenshotPath = `/home/srant/.gemini/antigravity/brain/d24092a8-3e1c-42e1-90e2-997b6eaddb23/test_fail_${testInfo.title.replace(/\s+/g, '_')}.png`;
            await page.screenshot({ path: screenshotPath });
            console.log(`Saved failure screenshot to: ${screenshotPath}`);
        }
    });

    test('should render the premium dashboard layout', async ({ page }) => {
        // Check for the sidebar
        await expect(page.locator('aside')).toBeVisible();

        // Check for the top navigation with user name
        await expect(page.locator('header')).toBeVisible();
        await expect(page.locator('header')).toContainText(/Test User/);
    });

    test('should display all main financial widgets', async ({ page }) => {
        // Market Performance Card
        await expect(page.getByText('Market Performance')).toBeVisible();

        // Trade Accuracy Card
        await expect(page.getByText('Trade Accuracy')).toBeVisible();

        // Exchange Rates
        await expect(page.getByText('Exchange Rates')).toBeVisible();

        // Recent Activity (Specific heading)
        await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();

        // Bot Health
        await expect(page.getByText('Bot Health')).toBeVisible();
    });

    test('should show wallet balance in CreditCardWidget', async ({ page }) => {
        // Look for the "Available Balance" section which contains the SOL value
        const balanceContainer = page.locator('div:has-text("Available Balance")').last();
        await expect(balanceContainer).toBeVisible();
        await expect(balanceContainer).toContainText('SOL');
    });

    test('should have working toggle buttons for mode and agent', async ({ page }) => {
        // Mode button (Simulation/Mainnet)
        const modeButton = page.locator('button:has-text("SIMULATION"), button:has-text("LIVE")').first();
        await expect(modeButton).toBeVisible();

        // Agent button (Bot Running/Paused)
        const agentButton = page.locator('button:has-text("Bot Running"), button:has-text("Bot Paused")').first();
        await expect(agentButton).toBeVisible();
    });

    test('should display charts correctly', async ({ page }) => {
        // Check if Recharts elements are present (usually they use SVG)
        const charts = page.locator('.recharts-responsive-container');
        const count = await charts.count();
        expect(count).toBeGreaterThanOrEqual(3); // Balance, Accuracy, Score
    });
});

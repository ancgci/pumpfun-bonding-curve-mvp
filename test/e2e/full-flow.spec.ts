import { test, expect } from '@playwright/test';

test.describe('Dashboard Full Flow Simulation', () => {

    test('should simulate full life cycle: Connect -> Trade -> Update Chart', async ({ page }) => {
        // 1. Setup Mocks for initial state
        await page.route('**/api/stats', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    totalInvested: 0.1,
                    winRate: 0,
                    wins: 0,
                    losses: 0,
                    circuitBreaker: { isTripped: false, dailyLoss: 0, consecutiveFailures: 0 }
                })
            });
        });

        await page.route('**/api/positions', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([])
            });
        });

        await page.route('**/api/pl-history', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ timestamps: [], plValues: [] })
            });
        });

        await page.route('**/api/bot-health', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'OPERATIONAL' })
            });
        });

        // 2. Load Dashboard
        await page.goto('/');
        await expect(page.locator('#botHealthText')).toHaveText('Operational');
        await expect(page.locator('#totalInvested')).toHaveText('0.1000 SOL');
        await expect(page.locator('#activeCount')).toHaveText('0');

        // 3. Simulate a Trade (Position Opended)
        // Update mock for next refresh or socket push
        const mockPositions = [{
            mint: 'MOCK_TOKEN_123456789',
            buySolAmount: 0.05,
            buyTokenAmount: 1000000,
            takeProfit: 100,
            stopLoss: 20,
            ageFormatted: '1m',
            pnlPercent: 0
        }];

        await page.route('**/api/positions', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockPositions)
            });
        });

        // Use page.evaluate to trigger immediate UI refresh via internal app function
        // simulating the effect of a WebSocket update or polling cycle
        await page.evaluate((pos) => {
            // @ts-ignore
            if (typeof window.updatePositions === 'function') {
                // @ts-ignore
                window.updatePositions(pos);
            }
        }, mockPositions);

        await expect(page.locator('#activeCount')).toHaveText('1');
        await expect(page.locator('.position-mint')).toContainText('MOCK_TO');

        // 4. Update P&L Chart (Trade Closed with Profit)
        const mockPLHistory = {
            timestamps: ['12:00', '12:05'],
            plValues: [0, 0.02]
        };

        const mockStatsUpdate = {
            totalInvested: 0.15,
            winRate: 100,
            wins: 1,
            losses: 0,
            circuitBreaker: { isTripped: false, dailyLoss: 0, consecutiveFailures: 0 }
        };

        // Simulate WebSocket 'pnl-update' message
        await page.evaluate(({ pl, stats }) => {
            // @ts-ignore
            if (window.socket && window.socket.connected) {
                // We can't easily "inject" into the real socket, 
                // but we can call the handler functions directly
                // @ts-ignore
                window.updateStats(stats);
                // @ts-ignore
                window.updatePLChart(pl);
            } else {
                // Fallback to calling update functions directly if socket not ready
                // @ts-ignore
                window.updateStats(stats);
                // @ts-ignore
                window.updatePLChart(pl);
            }
        }, { pl: mockPLHistory, stats: mockStatsUpdate });

        // Verify P&L Stats updated
        await expect(page.locator('#wins')).toHaveText('1');
        await expect(page.locator('#totalInvested')).toHaveText('0.1500 SOL');

        // Verify Chart Canvas exists (it should be visible and updated)
        const chartCanvas = page.locator('#plChart');
        await expect(chartCanvas).toBeVisible();
    });
});

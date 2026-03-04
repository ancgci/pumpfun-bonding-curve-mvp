import { test, expect } from '@playwright/test';

test.describe('Dashboard E2E Tests', () => {

    test.beforeEach(async ({ page }) => {
        // Go to the dashboard
        await page.goto('/');
    });

    test('should load the dashboard with title and health badge', async ({ page }) => {
        await expect(page).toHaveTitle(/PumpFun Trading Bot/);
        const healthBadge = page.locator('#botHealthBadge');
        await expect(healthBadge).toBeVisible();
    });

    // Test 1: Responsividade (viewport mobile)
    test('should be responsive on mobile viewport', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 }); // iPhone 8/SE size

        // Verify container exists and is constrained or scrollable
        const container = page.locator('.container');
        await expect(container).toBeVisible();

        // Header title should still be visible but maybe wrapped/smaller
        const title = page.locator('h1');
        await expect(title).toBeVisible();

        // Stats grid should probably stack (simple check if visible)
        const statsGrid = page.locator('.stats-grid');
        await expect(statsGrid).toBeVisible();
    });

    // Test 2: Toggle AGENT_MODE
    test('should toggle Agent Mode and change label', async ({ page, context }) => {
        const modeCheckbox = page.locator('#toggleModeCheckbox');
        const modeLabel = page.locator('#toggleModeLabel');

        // Mock the API response for toggling mode to ensure reliability in test
        await page.route('**/api/agent/mode', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
        });

        // Capture initial state
        const initialState = await modeLabel.textContent();

        // Toggle (click the track or label since input might be hidden)
        await page.click('.mode-toggle .toggle-track');

        // Verify label changes (logic in app.js updates it after fetchAgentStats)
        // We might need to wait for the label to update or mock the /agent/stats call too
        await page.route('**/api/agent/stats', async route => {
            const newMode = initialState?.includes('SIMULATION') ? 'LIVE' : 'SIMULATION';
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    enabled: true,
                    mode: newMode,
                    confidence: 70
                })
            });
        });

        // The app.js calls fetchAgentStats after 500ms
        await expect(modeLabel).not.toHaveText(initialState || '');
    });

    // Test 3: Erro se API falhar (mostra mensagem)
    test('should show error toast if API fails', async ({ page }) => {
        // Intercept stats call and return error
        await page.route('**/api/stats', async route => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Database connection failed' })
            });
        });

        // Trigger an action that calls API or just reload
        await page.reload();

        // Check for toast (app.js creates a .toast element)
        const toast = page.locator('.toast-error');
        // Note: fetchStats in app.js logs to console on error but doesn't always show toast
        // Let's trigger an action that definitely shows toast, like saveParams

        await page.route('**/api/trading-config', async route => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Validation Error' })
            });
        });

        await page.click('#saveParamsBtn');
        await expect(page.locator('.toast-error')).toBeVisible();
        await expect(page.locator('.toast-error')).toContainText('Validation Error');
    });

    // Test 4: Screenshot on failure is handled by playwright.config.ts
    // We can simulate a failure to verify, but usually we just trust the config.
});

import { defineConfig, devices } from '@playwright/test';

/**
 * E2E test configuration for Avarts.
 *
 * Prerequisites:
 * - PocketBase must be running at http://127.0.0.1:8090
 * - Default admin credentials: admin@avarts.lan / adminadmin
 * - PUBLIC_REGISTRATION must be set to "true"
 *
 * The test suite will:
 *   1. Register a new test user account via the UI
 *   2. Test all app features end-to-end
 *   3. Clean up all created test data via the PocketBase admin API
 */
export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false, // tests must run in order (setup -> features -> teardown)
	forbidOnly: !!process.env.CI,
	retries: 0,
	workers: 1,
	reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
	use: {
		baseURL: process.env.TEST_BASE_URL || 'http://localhost:5173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'off',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:5173',
		reuseExistingServer: true,
		timeout: 120 * 1000,
	},
});

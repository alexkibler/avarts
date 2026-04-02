import { defineConfig, devices } from '@playwright/test';

/**
 * E2E test configuration for Bikeapelago.
 */
export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
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
		{
			name: 'mobile',
			use: {
				viewport: { width: 402, height: 874 },
				deviceScaleFactor: 3,
				isMobile: true,
				hasTouch: true,
				userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
			},
		},
	],
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:5173',
		reuseExistingServer: true,
		timeout: 120 * 1000,
		env: {
			PUBLIC_GRAPHHOPPER_URL: 'https://routing.alexkibler.com/route',
			PUBLIC_DB_URL: 'https://pb.bikeapelago.alexkibler.com',
		},
	},
});

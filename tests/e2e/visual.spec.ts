import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Visual UX Capture (Mock Mode)', () => {
	// Increase timeout for visual captures
	test.setTimeout(60000);

	test.use({
		// We expect the app to be running with PUBLIC_MOCK_MODE=true
		// We can also inject context or rely on the server environment.
	});

	async function captureAndAttach(page: any, testInfo: any, name: string) {
		// Wait for animations to settle
		await page.waitForTimeout(1000);
		const screenshotPath = path.join(testInfo.outputPath(), `${name}.png`);
		await page.screenshot({ path: screenshotPath, fullPage: true });
		await testInfo.attach(name, {
			path: screenshotPath,
			contentType: 'image/png'
		});
	}

	test('Capture key UI states', async ({ page }, testInfo) => {
		page.on('console', (msg) => console.log(`[Browser] ${msg.type()}: ${msg.text()}`));
		page.on('pageerror', (err) => console.error(`[Browser Error] ${err.message}`));

		// Ensure mock mode is engaged
		await page.addInitScript(() => {
			(window as any).PLAYWRIGHT_TEST = true;
		});

		// 1. Dashboard
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await captureAndAttach(page, testInfo, '1_Dashboard');

		// 2. New Game Page
		await page.goto('/new-game');
		await page.waitForLoadState('networkidle');
		await captureAndAttach(page, testInfo, '2_NewGame_Form');

		// Fill out the new game form
		await page.fill('input#seedName', 'Visual Test Seed');
		await page.fill('input#slotName', 'Player1');
		await page.fill('input[placeholder="Search address or place…"]', 'New York');
		await page.click('button:has-text("Search")');
		await page.waitForTimeout(1000); // Wait for mock geocode
		await captureAndAttach(page, testInfo, '3_NewGame_Map_Selected');

		// Submit the form
		await page.click('button:has-text("Generate Session")');
		await page.waitForURL('**/game/*');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000); // Wait for the game session to fully initialize
		await captureAndAttach(page, testInfo, '4_Game_Initial_State');

		// 3. Game UI Tabs (Since we mock AP, clicking Connect should immediately transition state)
		const connectButton = page.locator('button:has-text("Connect & Play")');
		const isConnectVisible = await connectButton.isVisible();
		console.log(`[Test] Connect & Play visible: ${isConnectVisible}`);

		if (isConnectVisible) {
			await connectButton.click();
			// Wait for the map to appear
			await page.waitForSelector('.map-container', { timeout: 10000 });
			await page.waitForTimeout(3000); // Give Leaflet and tiles extra time to settle
			await captureAndAttach(page, testInfo, '5_Game_Connected_State');
		} else {
			// Already connected or transitioned
			await page.waitForSelector('.map-container', { timeout: 10000 });
			await page.waitForTimeout(3000);
			await captureAndAttach(page, testInfo, '5_Game_Connected_State');
		}

		// Switch to Route Tab
		const routeTab = page.getByRole('button', { name: /Route/i });
		if (await routeTab.isVisible()) {
			await routeTab.click();
			await page.waitForTimeout(1000);
			await captureAndAttach(page, testInfo, '6_Game_Route_Tab');
		}

		// Switch to Upload Tab
		const uploadTab = page.getByRole('button', { name: /Upload/i });
		if (await uploadTab.isVisible()) {
			await uploadTab.click();
			await page.waitForTimeout(1000);
			await captureAndAttach(page, testInfo, '7_Game_Upload_Tab');
		}

		// Switch to Chat Tab
		const chatTab = page.getByRole('button', { name: /Chat/i });
		if (await chatTab.isVisible()) {
			await chatTab.click();
			await page.waitForTimeout(1000);
			await captureAndAttach(page, testInfo, '8_Game_Chat_Tab');
		}

		// 4. Athlete Profile Page
		await page.goto('/athlete');
		await page.waitForLoadState('networkidle');
		await captureAndAttach(page, testInfo, '9_Athlete_Profile');
	});
});

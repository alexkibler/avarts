import { test, expect } from '@playwright/test';
import { FitWriter } from '@markw65/fit-file-writer';
import * as fs from 'fs';
import * as path from 'path';

test('Verify .fit upload unlocks new nodes on the map', async ({ page }) => {
	// Enable browser logging for debugging
	page.on('console', (msg) => {
		console.log(`[Browser ${msg.type()}] ${msg.text()}`);
	});

	// Ensure mock mode
	await page.addInitScript(() => {
		(window as any).PLAYWRIGHT_TEST = true;
	});

	await page.goto('/game/mock_session_123');
	await page.waitForLoadState('networkidle');
	await page.waitForSelector('.leaflet-interactive', { timeout: 15000 });

	const connectButton = page.locator('button:has-text("Connect & Play")');
	if (await connectButton.isVisible()) {
		await connectButton.click();
	}
	await expect(page.locator('text=Upload .fit')).toBeVisible({ timeout: 15000 });

	// 1. Initial State: Identify an available node
	// In mock mode, mock_session_123 center is NYC: { lat: 40.7128, lon: -74.006 }
	const centerNode = { lat: 40.7128, lon: -74.006 };

	// 2. Count Available/Hidden nodes before upload
	// We can't easily count markers in the DOM because Leaflet uses Canvas for CircleMarkers by default,
	// but we can check the 'Routes' tab which lists available nodes if we were to open it, 
	// or just rely on the logic verification.
	// Actually, let's open the Route tab to see the list.
	await page.getByRole('button', { name: /Route/i }).click();
	const initialAvailableCount = await page.locator('.btn-waypoint-toggle').count();
	console.log(`[Test] Initial available nodes listed: ${initialAvailableCount}`);

	// 3. Generate and Upload FIT file
	const toSemicircles = (deg: number) => Math.round(deg * (Math.pow(2, 31) / 180));
	const writer = new FitWriter();
	writer.writeMessage('file_id', { type: 'activity', manufacturer: 'development', product: 0, serial_number: 777, time_created: writer.time(new Date()) });
	const startTime = new Date();
	writer.writeMessage('activity', { timestamp: writer.time(startTime), num_sessions: 1, type: 'manual', event: 'activity', event_type: 'start' });
	writer.writeMessage('session', { timestamp: writer.time(startTime), start_time: writer.time(startTime), sport: 'cycling', total_elapsed_time: 10, total_timer_time: 10, total_distance: 100, total_ascent: 5 });
	writer.writeMessage('lap', { timestamp: writer.time(startTime), start_time: writer.time(startTime), total_elapsed_time: 10, total_timer_time: 10, total_distance: 100, total_ascent: 5 });
	// Hit the center node
	writer.writeMessage('record', { timestamp: writer.time(startTime), position_lat: toSemicircles(centerNode.lat), position_long: toSemicircles(centerNode.lon), altitude: 250 });
	const fitData = writer.finish();
	const fitFilePath = path.join(process.cwd(), 'temp_unlock_test.fit');
	fs.writeFileSync(fitFilePath, new Uint8Array(fitData.buffer));

	await page.getByRole('button', { name: /Upload/i }).click();
	await page.locator('input#file-upload').setInputFiles(fitFilePath);
	await page.click('button:has-text("Analyze Ride")');

	// Verify the check is found
	await expect(page.locator('.text-green-400')).toContainText('Check #');
	
	// 4. Confirm and wait for Mock Unlock
	await page.click('button:has-text("Confirm & Send")');
	await expect(page.locator('text=Successfully validated')).toBeVisible({ timeout: 15000 });

	// Wait for mock logic to trigger (0.5s timeout in ap.ts + DB roundtrip)
	await page.waitForTimeout(2000);

	// 5. Verify: Check the Route tab again
	await page.getByRole('button', { name: /Route/i }).click();
	const finalAvailableCount = await page.locator('.btn-waypoint-toggle').count();
	console.log(`[Test] Final available nodes listed: ${finalAvailableCount}`);

	// In Mock Mode: 
	// - 1 node was Checked (removed from Available list)
	// - 1 node was Unlocked (added to Available list)
	// Total count should stay the same (or change if logic differed, but our mock adds 1-for-1)
	// Wait, actually if I check a location, it goes from Available -> Checked.
	// Then the mock unlocks a Hidden -> Available.
	// So count should remain the same.
	expect(finalAvailableCount).toBe(initialAvailableCount);

	// 6. Capture screenshot of the map with the new nodes
	// Switch back to chat or just stay on route to see markers
	const screenshotPath = path.join(process.cwd(), 'static/docs/screenshots/8_Unlocking_Nodes.png');
	await page.screenshot({ path: screenshotPath, fullPage: true });
	console.log(`[Test] Screenshot saved to ${screenshotPath}`);

	if (fs.existsSync(fitFilePath)) fs.unlinkSync(fitFilePath);
});

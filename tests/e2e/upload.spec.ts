import { test, expect } from '@playwright/test';
import { FitWriter } from '@markw65/fit-file-writer';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Fit Upload Confirmation & Validation', () => {
	test.setTimeout(120000);

	test.beforeEach(async ({ page }) => {
		page.on('console', (msg) => {
			console.log(`[Browser ${msg.type()}] ${msg.text()}`);
		});
		page.on('pageerror', (err) => {
			console.error(`[Browser Error] ${err.message}`);
		});
		// Ensure mock mode
		await page.addInitScript(() => {
			(window as any).PLAYWRIGHT_TEST = true;
		});
	});

	function createFitFile(filePath: string, lat: number, lon: number) {
		const toSemicircles = (deg: number) => Math.round(deg * (Math.pow(2, 31) / 180));
		const writer = new FitWriter();
		writer.writeMessage('file_id', { type: 'activity', manufacturer: 'development', product: 0, serial_number: 123, time_created: writer.time(new Date()) });
		const startTime = new Date();
		writer.writeMessage('activity', { timestamp: writer.time(startTime), num_sessions: 1, type: 'manual', event: 'activity', event_type: 'start' });
		writer.writeMessage('session', { timestamp: writer.time(startTime), start_time: writer.time(startTime), sport: 'cycling', total_elapsed_time: 10, total_timer_time: 10, total_distance: 100, total_ascent: 5 });
		writer.writeMessage('lap', { timestamp: writer.time(startTime), start_time: writer.time(startTime), total_elapsed_time: 10, total_timer_time: 10, total_distance: 100, total_ascent: 5 });
		writer.writeMessage('record', { timestamp: writer.time(startTime), position_lat: toSemicircles(lat), position_long: toSemicircles(lon), altitude: 250 });
		const fitData = writer.finish();
		fs.writeFileSync(filePath, new Uint8Array(fitData.buffer));
	}

	test('should analyze ride and clear nodes on confirmation', async ({ page }) => {
		await page.goto('/game/mock_session_123');
		await page.waitForLoadState('networkidle');
		await page.waitForSelector('.leaflet-interactive', { timeout: 15000 });
		
		const connectButton = page.locator('button:has-text("Connect & Play")');
		if (await connectButton.isVisible()) {
			await connectButton.click();
		}
		await expect(page.locator('text=Upload .fit')).toBeVisible({ timeout: 15000 });

		const fitFilePath = path.join(process.cwd(), 'temp_test_ride_ok.fit');
		createFitFile(fitFilePath, 40.7128, -74.006);

		await page.getByRole('button', { name: /Upload/i }).click();
		await page.locator('input#file-upload').setInputFiles(fitFilePath);
		
		const analyzeBtn = page.locator('button:has-text("Analyze Ride")');
		await expect(analyzeBtn).toBeVisible();
		await analyzeBtn.click();

		await expect(page.locator('text=Distance')).toBeVisible({ timeout: 15000 });
		const locationsList = page.locator('.text-green-400');
		await expect(locationsList.first()).toBeVisible();
		
		await page.click('button:has-text("Confirm & Send")');
		await expect(page.locator('text=Successfully validated')).toBeVisible({ timeout: 15000 });

		if (fs.existsSync(fitFilePath)) fs.unlinkSync(fitFilePath);
	});

	test('should clear path and reset UI on cancel', async ({ page }) => {
		await page.goto('/game/mock_session_123');
		await page.waitForLoadState('networkidle');
		await page.waitForSelector('.leaflet-interactive', { timeout: 15000 });

		const fitFilePath = path.join(process.cwd(), 'temp_test_cancel.fit');
		createFitFile(fitFilePath, 40.7128, -74.006);

		await page.getByRole('button', { name: /Upload/i }).click();
		await page.locator('input#file-upload').setInputFiles(fitFilePath);
		await page.click('button:has-text("Analyze Ride")');

		await expect(page.locator('text=Distance')).toBeVisible({ timeout: 15000 });
		
		const cancelBtn = page.locator('button:has-text("Cancel")');
		await expect(cancelBtn).toBeEnabled();
		await cancelBtn.click();

		await expect(page.locator('text=Analyze Ride')).not.toBeVisible();
		await expect(page.locator('text=Click to upload')).toBeVisible();

		if (fs.existsSync(fitFilePath)) fs.unlinkSync(fitFilePath);
	});

	test('should show 0 locations for ride in different area', async ({ page }) => {
		await page.goto('/game/mock_session_123');
		await page.waitForLoadState('networkidle');
		await page.waitForSelector('.leaflet-interactive', { timeout: 15000 });

		const fitFilePath = path.join(process.cwd(), 'temp_test_far.fit');
		createFitFile(fitFilePath, 51.5074, -0.1278);

		await page.getByRole('button', { name: /Upload/i }).click();
		await page.locator('input#file-upload').setInputFiles(fitFilePath);
		await page.click('button:has-text("Analyze Ride")');

		// Wait for summary to appear even if 0 locations
		await expect(page.locator('text=Distance')).toBeVisible({ timeout: 15000 });
		await expect(page.locator('text=No locations reached in this ride.')).toBeVisible({ timeout: 10000 });
		
		const confirmBtn = page.locator('button:has-text("Confirm & Send")');
		await expect(confirmBtn).toBeDisabled();

		if (fs.existsSync(fitFilePath)) fs.unlinkSync(fitFilePath);
	});
});

import { test, expect } from '@playwright/test';
import { FitWriter } from '@markw65/fit-file-writer';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Documentation Screenshots', () => {
    test.beforeEach(async ({ page }) => {
        // Ensure mock mode
        await page.addInitScript(() => {
            (window as any).PLAYWRIGHT_TEST = true;
        });
    });

    test('Capture YAML Creator Screenshot', async ({ page }) => {
        await page.goto('/yaml-creator');
        await page.waitForLoadState('networkidle');
        
        await page.fill('input#slotName', 'MyCyclingAdventure');
        await page.fill('input#checkCount', '50');

        const screenshotPath = path.join(process.cwd(), 'static/docs/screenshots/10_YAML_Creator.png');
        await page.screenshot({ path: screenshotPath });
        console.log(`YAML Creator screenshot saved to ${screenshotPath}`);
    });

    test('Capture Node Unlock Flow Screenshot', async ({ page }) => {
        await page.goto('/game/mock_session_123');
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('.leaflet-interactive', { timeout: 15000 });

        const connectButton = page.locator('button:has-text("Connect & Play")');
        if (await connectButton.isVisible()) {
            await connectButton.click();
        }

        // Generate a FIT file to check a location
        const toSemicircles = (deg: number) => Math.round(deg * (Math.pow(2, 31) / 180));
        const writer = new FitWriter();
        writer.writeMessage('file_id', { type: 'activity', manufacturer: 'development', product: 0, serial_number: 123, time_created: writer.time(new Date()) });
        const startTime = new Date();
        writer.writeMessage('activity', { timestamp: writer.time(startTime), num_sessions: 1, type: 'manual', event: 'activity', event_type: 'start' });
        writer.writeMessage('session', { timestamp: writer.time(startTime), start_time: writer.time(startTime), sport: 'cycling', total_elapsed_time: 10, total_timer_time: 10, total_distance: 100, total_ascent: 5 });
        writer.writeMessage('lap', { timestamp: writer.time(startTime), start_time: writer.time(startTime), total_elapsed_time: 10, total_timer_time: 10, total_distance: 100, total_ascent: 5 });
        // NYC center node in mock mode
        writer.writeMessage('record', { timestamp: writer.time(startTime), position_lat: toSemicircles(40.7128), position_long: toSemicircles(-74.006), altitude: 250 });
        const fitData = writer.finish();
        const fitFilePath = path.join(process.cwd(), 'temp_docs_unlock.fit');
        fs.writeFileSync(fitFilePath, new Uint8Array(fitData.buffer));

        await page.getByRole('button', { name: /Upload/i }).click();
        await page.locator('input#file-upload').setInputFiles(fitFilePath);
        await page.click('button:has-text("Analyze Ride")');
        await page.click('button:has-text("Confirm & Send")');

        // Wait for unlock logic and map update
        await page.waitForTimeout(3000);

        const screenshotPath = path.join(process.cwd(), 'static/docs/screenshots/8_Unlocking_Nodes.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Node Unlock screenshot saved to ${screenshotPath}`);

        if (fs.existsSync(fitFilePath)) fs.unlinkSync(fitFilePath);
    });
});

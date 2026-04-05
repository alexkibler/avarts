import { test, expect } from '@playwright/test';
import { FitWriter } from '@markw65/fit-file-writer';
import * as fs from 'fs';
import * as path from 'path';

test('Capture Ride Summary Screenshot', async ({ page }) => {
    // Ensure mock mode
    await page.addInitScript(() => {
        (window as any).PLAYWRIGHT_TEST = true;
    });

    await page.goto('/game/mock_session_123');
    await page.waitForLoadState('networkidle');
    
    const connectButton = page.locator('button:has-text("Connect & Play")');
    if (await connectButton.isVisible()) {
        await connectButton.click();
    }

    // Generate a valid FIT file
    const toSemicircles = (deg: number) => Math.round(deg * (Math.pow(2, 31) / 180));
    const writer = new FitWriter();
    writer.writeMessage('file_id', { type: 'activity', manufacturer: 'development', product: 0, serial_number: 999, time_created: writer.time(new Date()) });
    const startTime = new Date();
    writer.writeMessage('activity', { timestamp: writer.time(startTime), num_sessions: 1, type: 'manual', event: 'activity', event_type: 'start' });
    writer.writeMessage('session', { timestamp: writer.time(startTime), start_time: writer.time(startTime), sport: 'cycling', total_elapsed_time: 3600, total_timer_time: 3600, total_distance: 25000, total_ascent: 450 });
    writer.writeMessage('lap', { timestamp: writer.time(startTime), start_time: writer.time(startTime), total_elapsed_time: 3600, total_timer_time: 3600, total_distance: 25000, total_ascent: 450 });
    
    // Path points around NYC center
    for (let i = 0; i < 10; i++) {
        writer.writeMessage('record', { 
            timestamp: writer.time(new Date(startTime.getTime() + i * 1000)), 
            position_lat: toSemicircles(40.7128 + i * 0.001), 
            position_long: toSemicircles(-74.006 + i * 0.001),
            altitude: 250 + i * 2,
            heart_rate: 140 + i,
            power: 200 + i * 5,
            distance: i * 100
        });
    }

    const fitData = writer.finish();
    const fitFilePath = path.join(process.cwd(), 'temp_capture.fit');
    fs.writeFileSync(fitFilePath, new Uint8Array(fitData.buffer));

    // Upload
    await page.getByRole('button', { name: /Upload/i }).click();
    await page.locator('input#file-upload').setInputFiles(fitFilePath);
    await page.click('button:has-text("Analyze Ride")');

    // Wait for summary UI
    await expect(page.locator('text=Distance')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000); // Wait for map zoom/polyline animations

    // Capture screenshot
    const screenshotPath = path.join(process.cwd(), 'static/docs/screenshots/7_Ride_Summary.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);

    if (fs.existsSync(fitFilePath)) fs.unlinkSync(fitFilePath);
});

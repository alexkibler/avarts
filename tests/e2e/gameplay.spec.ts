/**
 * E2E gameplay test for Bikeapelago.
 *
 * Baseline state enforced by beforeEach via resetGameDb():
 *   3 Available · 7 Hidden · 0 Checked
 *
 * After uploading a simulated FIT that passes through all Available nodes:
 *   6 Hidden · 3 Available · 1 Checked  (per node checked)
 *
 * The ap.ts test-mode mock (triggered by window.PLAYWRIGHT_TEST = true) now:
 *   1. Marks the location node as Checked in PocketBase (idempotent with validation.ts)
 *   2. Unlocks one Hidden → Available node per check (simulating item receipt from AP server)
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import GPXParser from 'gpxparser';
import { FitWriter } from '@markw65/fit-file-writer';
import { resetSessionNodes, BASELINE_AVAILABLE } from '../reset-db';
import { setupTestGame, type GameTestContext } from '../game-setup';

// ---------------------------------------------------------------------------
// FIT file builder
// ---------------------------------------------------------------------------

function createFitBuffer(points: { lat: number; lon: number }[]): Uint8Array {
	const fitWriter = new FitWriter();
	const startTime = new Date();
	const start = fitWriter.time(startTime);

	fitWriter.writeMessage('file_id', {
		type: 'activity',
		manufacturer: 'garmin',
		product: 0,
		serial_number: 12345,
		time_created: start,
		product_name: 'Playwright',
	}, null, true);

	fitWriter.writeMessage('activity', {
		total_timer_time: points.length * 5,
		num_sessions: 1,
		type: 'manual',
		timestamp: start,
		local_timestamp: start - startTime.getTimezoneOffset() * 60,
	}, null, true);

	fitWriter.writeMessage('session', {
		event: 'session',
		event_type: 'start',
		start_time: start,
		timestamp: start,
		total_elapsed_time: points.length * 5,
		total_timer_time: points.length * 5,
		sport: 'cycling',
		sub_sport: 'generic',
		first_lap_index: 0,
		num_laps: 1,
	}, null, false);

	fitWriter.writeMessage('lap', {
		event: 'lap',
		event_type: 'start',
		start_time: start,
		timestamp: start,
		total_elapsed_time: points.length * 5,
		total_timer_time: points.length * 5,
	}, null, false);

	let current_time = start;
	let total_dist = 0;

	points.forEach((pt) => {
		current_time += 5;
		total_dist += 10;
		fitWriter.writeMessage('record', {
			timestamp: current_time,
			distance: total_dist,
			speed: 2.0,
			position_lat: fitWriter.latlng(pt.lat * Math.PI / 180),
			position_long: fitWriter.latlng(pt.lon * Math.PI / 180),
		});
	});

	fitWriter.writeMessage('session', { timestamp: start }, null, true);
	fitWriter.writeMessage('lap',     { timestamp: start }, null, true);
	fitWriter.writeMessage('record',  { timestamp: start }, null, true);

	const fitData = fitWriter.finish();
	return new Uint8Array(fitData.buffer, fitData.byteOffset, fitData.byteLength);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read the HUD counters from the top nav. Returns { hidden, available, checked }. */
async function readHud(page: any) {
	const hidden    = parseInt(await page.locator('.counter .num').nth(0).textContent() ?? '0', 10);
	const available = parseInt(await page.locator('.counter .num').nth(1).textContent() ?? '0', 10);
	const checked   = parseInt(await page.locator('.counter .num').nth(2).textContent() ?? '0', 10);
	return { hidden, available, checked };
}

async function takeScreenshot(page: any, name: string) {
	const projectName = test.info().project.name;
	const isMobile = projectName === 'mobile';
	const path = `test-screenshots/${name}-${projectName}.png`;
	const panel = page.locator('.panel');
	const isPanelOpen = await panel.isVisible();

	// Support indicating "the fold" on mobile full-page screenshots
	if (isMobile) {
		const viewport = page.viewportSize();
		if (viewport) {
			await page.evaluate((height: number) => {
				const fold = document.createElement('div');
				fold.id = 'fold-indicator';
				fold.style.position = 'absolute';
				fold.style.top = `${height}px`;
				fold.style.left = '0';
				fold.style.right = '0';
				fold.style.height = '2px';
				fold.style.backgroundColor = 'red';
				fold.style.zIndex = '999999';
				fold.style.pointerEvents = 'none';
				document.body.appendChild(fold);
			}, viewport.height);
		}
	}

	if (isPanelOpen || isMobile) {
		// Inject "unlock" CSS to allow full-page expansion if we need a full-page shot
		await page.addStyleTag({ content: `
			.mockup-app-root, .main-area, .panel, .panel-body {
				height: auto !important;
				min-height: 100% !important;
				overflow: visible !important;
				max-height: none !important;
			}
			.mockup-app-root { display: block !important; }
			.panel { position: relative !important; width: 100% !important; border: none !important; }
			.bottomnav { position: relative !important; margin-top: 20px; z-index: 2000; }
		`, id: 'screenshot-style' });

		await page.screenshot({ path, fullPage: true });

		// Cleanup: Remove styles and the fold indicator
		await page.evaluate(() => {
			document.getElementById('screenshot-style')?.remove();
			document.getElementById('fold-indicator')?.remove();
		});
	} else {
		// Normal viewport screenshot for non-mobile/non-panel views
		await page.screenshot({ path });
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Gameplay flow', () => {
	let gameCtx: GameTestContext;

	test.beforeAll(async () => {
		gameCtx = await setupTestGame();
	});

	test.afterAll(async () => {
		await gameCtx.teardown();
	});

	test.beforeEach(async () => {
		await resetSessionNodes(gameCtx.adminToken, gameCtx.sessionId, BASELINE_AVAILABLE);
	});

	test('full gameplay: login → session → route → export GPX → upload FIT → verify HUD', async ({ page, context }) => {
		page.on('console', (msg: any) => console.log(`[Browser] ${msg.type()}: ${msg.text()}`));

		await page.addInitScript(() => {
			(window as any).PLAYWRIGHT_TEST = true;
		});

		test.setTimeout(90000);

		// ── 1. Login ─────────────────────────────────────────────────────────
		await page.goto('/');
		await page.locator('input[name="username"]').fill(gameCtx.credentials.username);
		await page.locator('input[name="password"]').fill(gameCtx.credentials.password);
		await page.locator('button[type="submit"]:has-text("Login")').click();
		await expect(page.locator('a:has-text("Dashboard")')).toBeVisible({ timeout: 10000 });

		// ── 2. Navigate directly to the game session ──────────────────────────
		// We know the session ID from setup, so skip the sessions list entirely.
		// Set geolocation to the session center (Pittsburgh defaults).
		await context.grantPermissions(['geolocation']);
		await context.setGeolocation({ latitude: 40.4406, longitude: -79.9959 });

		await page.goto(`/game/${gameCtx.sessionId}`);
		await expect(page).toHaveURL(/.*\/game\/.+/);

		// Connect in test-mode if the connection screen is shown
		const connectBtn = page.locator('button:has-text("Connect & Play")');
		if (await connectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
			await takeScreenshot(page, 'connection-screen');
			await page.locator('#ap-url').fill('test');
			await page.locator('#ap-slot').fill('test-slot');
			await connectBtn.click();
		}

		// ── 3. Wait for map ───────────────────────────────────────────────────
		await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15000 });
		await page.waitForTimeout(3000); // let PB subscription settle and nodes render

		await takeScreenshot(page, 'gameplay-screen-bare');

		// ── 6. Assert baseline HUD counts ─────────────────────────────────────
		const baselineHud = await readHud(page);
		console.log('[Test] Baseline HUD:', baselineHud);
		// Total nodes should be consistent; available should be BASELINE_AVAILABLE
		expect(baselineHud.available).toBe(BASELINE_AVAILABLE);
		expect(baselineHud.checked).toBe(0);

		// ── 7. Set location & click route-start button ────────────────────────
		const locBtn = page.locator('.ap-loc-btn');
		if (await locBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
			await locBtn.click();
			await page.waitForTimeout(1000);
		}

		// ── 8. Click interactive node markers to build a route ────────────────
		const paths = page.locator('path.leaflet-interactive');
		const count = await paths.count();
		let clickedNodes = 0;

		for (let i = 0; i < count; i++) {
			const box = await paths.nth(i).boundingBox();
			if (box && box.width > 5 && box.width < 50) {
				await paths.nth(i).click({ force: true });
				clickedNodes++;
				await page.waitForTimeout(500);
			}
		}

		expect(clickedNodes).toBeGreaterThan(0);
		
		// ── 8.5 Wait for routing ──────────────────────────────────────────
		// With a real routing engine, this takes longer than 10ms.
		// Wait for the distance to appear and be non-zero.
		await expect(async () => {
			const distText = await page.locator('.route-stats .stat-value, .mobile-route-hud .stat-value, .leaflet-routing-container .leaflet-routing-summary h2').first().textContent();
			const dist = parseFloat(distText || '0');
			expect(dist).toBeGreaterThan(0);
		}).toPass({ timeout: 20000 });

		// ── 8.6 Open Route Panel or use Mobile HUD ───────────────────────────
		const routeTab = page.locator('.bottomnav-tab:has-text("Route")');
		if (await routeTab.isVisible()) {
			await routeTab.click({ force: true });
			await page.waitForTimeout(1000);
		}
		await takeScreenshot(page, 'gameplay-screen-route');

		// ── 9. Export GPX ─────────────────────────────────────────────────────
		const downloadPromise = page.waitForEvent('download');
		
		// Track expected filename (defaults to Archipelago_Route.gpx if input is hidden on mobile)
		let expectedFilename = 'Archipelago_Route.gpx';
		const courseInput = page.locator('input[placeholder="Course Name"]');
		if (await courseInput.isVisible()) {
			await courseInput.fill('Playwright Test Course');
			expectedFilename = 'Playwright_Test_Course.gpx';
		}
		
		// Ensure button is enabled before clicking (routing might take time)
		// It could be in the panel OR in the mobile HUD
		const exportBtn = page.locator('.mobile-hud-export, button:has-text("Export GPX")').filter({ visible: true }).first();
		await expect(exportBtn).toBeEnabled({ timeout: 15000 });
		await exportBtn.click({ force: true });

		const download = await downloadPromise;
		expect(download.suggestedFilename()).toBe(expectedFilename);

		const downloadPath = await download.path();
		expect(downloadPath).not.toBeNull();
		if (!downloadPath) return;

		const gpxContent = fs.readFileSync(downloadPath, 'utf8');
		const gpx = new GPXParser();
		gpx.parse(gpxContent);

		expect(gpx.tracks.length).toBeGreaterThan(0);
		expect(gpx.tracks[0].points.length).toBeGreaterThan(0);
		expect(gpx.tracks[0].distance.total).toBeGreaterThan(0);

		// ── 10. Build FIT from GPX points ─────────────────────────────────────
		const points = gpx.tracks[0].points.map((p: any) => ({ lat: p.lat, lon: p.lon }));
		const fitBuffer = createFitBuffer(points);

		fs.mkdirSync('test-results', { recursive: true });
		const fitPath = 'test-results/SimulatedRoute.fit';
		fs.writeFileSync(fitPath, fitBuffer);

		// ── 11. Upload FIT file ───────────────────────────────────────────────
		// Use the bottom navigation tab specifically to open the panel
		const uploadTab = page.locator('.bottomnav-tab:has-text("Upload")');
		if (await uploadTab.isVisible()) {
			await uploadTab.click({ force: true });
			await page.waitForTimeout(1000);
		}
		await takeScreenshot(page, 'upload-tab-empty');

		await page.locator('input[type="file"]').setInputFiles(fitPath);
		await page.waitForTimeout(500);
		await takeScreenshot(page, 'upload-tab-file-selected');

		await page.locator('button:has-text("Validate")').click();

		// Wait for at least one validation message
		await expect(page.locator('div.text-xs.text-neutral-200').first()).toBeVisible({ timeout: 15000 });
		await page.waitForTimeout(1500); // let UI settle
		await takeScreenshot(page, 'validate-results');

		// Count how many locations were validated
		const unlockedMsgs = await page.locator('div.text-xs.text-neutral-200:has-text("Unlocked Location")').count();
		console.log(`[Test] Validated ${unlockedMsgs} location(s)`);

		// ── 12. Close panel and wait for nodes to re-render ───────────────────
		await page.locator('button.panel-close').first().click({ force: true });

		// The ap.ts mock runs after 500 ms; wait for PB realtime to propagate
		await page.waitForTimeout(4000);
		await takeScreenshot(page, 'gameplay-screen-unlocked');

		// ── 13. Assert HUD counts after validation ────────────────────────────
		if (unlockedMsgs > 0) {
			const afterHud = await readHud(page);
			console.log('[Test] Post-validation HUD:', afterHud);

			// For each check: one Available → Checked, one Hidden → Available
			// Net change per check: hidden -1, available unchanged, checked +1
			const expectedChecked   = unlockedMsgs;
			const expectedAvailable = baselineHud.available; // available stays the same (one in, one out)
			const expectedHidden    = baselineHud.hidden - unlockedMsgs;

			expect(afterHud.checked).toBe(expectedChecked);
			expect(afterHud.available).toBe(expectedAvailable);
			expect(afterHud.hidden).toBe(expectedHidden);
		}
	});
});

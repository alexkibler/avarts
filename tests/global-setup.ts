/**
 * Global Playwright test setup.
 * Runs once before any tests, useful for initializing the test environment.
 */

import { getAdminToken, importSchema, PB_URL } from './admin';

export default async function globalSetup() {
	console.log(`[global-setup] Initializing test environment at ${PB_URL}`);

	try {
		// Get admin token
		const adminToken = await getAdminToken();
		console.log(`[global-setup] ✓ Authenticated as admin`);

		// Import collections from schema if they don't exist
		await importSchema(adminToken);
		console.log(`[global-setup] ✓ Schema imported/verified`);
	} catch (err) {
		console.error('[global-setup] Failed to set up test environment:', err);
		throw err;
	}

	console.log(`[global-setup] ✓ Test environment ready`);
}

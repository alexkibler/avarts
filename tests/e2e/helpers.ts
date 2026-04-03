/**
 * E2E test helpers for Bikeapelago.
 *
 * Provides direct PocketBase API access for test setup and cleanup,
 * so that test data created by the UI can be reliably deleted after
 * each test run.
 */

import { PB_URL, getAdminToken } from '../admin';

export { PB_URL, getAdminToken };
export const APP_URL = process.env.TEST_BASE_URL || 'http://localhost:5173';

/** Delete a PocketBase record by collection and ID (requires admin token). */
export async function deleteRecord(
	adminToken: string,
	collection: string,
	id: string
): Promise<void> {
	const res = await fetch(`${PB_URL}/api/collections/${collection}/records/${id}`, {
		method: 'DELETE',
		headers: { Authorization: adminToken },
	});

	if (!res.ok && res.status !== 404) {
		const text = await res.text();
		console.warn(`Failed to delete ${collection}/${id} (${res.status}): ${text}`);
	}
}

/** Create a test user directly via the PocketBase API (bypasses the UI). */
export async function createTestUser(
	adminToken: string,
	user: { username: string; password: string; name: string }
): Promise<string> {
	const randomSuffix = Math.random().toString(36).substring(2, 8);
	const res = await fetch(`${PB_URL}/api/collections/users/records`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: adminToken,
		},
		body: JSON.stringify({
			username: user.username,
			password: user.password,
			passwordConfirm: user.password,
			name: user.name,
			email: `${randomSuffix}@bikeapelago-test.local`,
			emailVisibility: false,
		}),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Could not create test user (${res.status}): ${text}`);
	}

	const data = await res.json();
	return data.id as string;
}

/** Fetch all activities belonging to a user. */
export async function getUserActivities(
	adminToken: string,
	userId: string
): Promise<Array<{ id: string }>> {
	const filter = encodeURIComponent(`user = "${userId}"`);
	const res = await fetch(
		`${PB_URL}/api/collections/activities/records?filter=${filter}&perPage=200`,
		{ headers: { Authorization: adminToken } }
	);

	if (!res.ok) return [];
	const data = await res.json();
	return data.items as Array<{ id: string }>;
}

/** Fetch all routes belonging to a user. */
export async function getUserRoutes(
	adminToken: string,
	userId: string
): Promise<Array<{ id: string }>> {
	const filter = encodeURIComponent(`user = "${userId}"`);
	const res = await fetch(
		`${PB_URL}/api/collections/routes/records?filter=${filter}&perPage=200`,
		{ headers: { Authorization: adminToken } }
	);

	if (!res.ok) return [];
	const data = await res.json();
	return data.items as Array<{ id: string }>;
}

/**
 * Delete all activities, routes, and the user account for a given user ID.
 * Call this in afterAll() to ensure clean state between test runs.
 */
export async function cleanupTestUser(adminToken: string, userId: string): Promise<void> {
	console.log(`\n🧹 Cleaning up test data for user ${userId}...`);

	const activities = await getUserActivities(adminToken, userId);
	for (const activity of activities) {
		await deleteRecord(adminToken, 'activities', activity.id);
		console.log(`  ✓ Deleted activity ${activity.id}`);
	}

	const routes = await getUserRoutes(adminToken, userId);
	for (const route of routes) {
		await deleteRecord(adminToken, 'routes', route.id);
		console.log(`  ✓ Deleted route ${route.id}`);
	}

	await deleteRecord(adminToken, 'users', userId);
	console.log(`  ✓ Deleted user ${userId}`);
}

/** Unique test credentials — use a timestamp so parallel runs don't collide. */
export function generateTestCredentials() {
	const ts = Date.now();
	return {
		username: `e2etest_${ts}`,
		password: 'TestPassword123!',
		name: 'E2E Test User',
	};
}

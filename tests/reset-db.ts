/**
 * DB reset helpers for the Bikeapelago E2E test suite.
 *
 * Resets map_nodes for a game session to a deterministic baseline so that
 * each test starts from a known state:
 *
 *   AVAILABLE_COUNT nodes → "Available"
 *   remaining nodes       → "Hidden"
 *   no nodes              → "Checked"
 *
 * Call resetSessionNodes() from a Playwright beforeEach hook.
 */

import { PB_URL, getAdminToken } from './admin';

/** Number of nodes that should be Available at test start. */
export const BASELINE_AVAILABLE = 3;

// ---------------------------------------------------------------------------
// User lookup
// ---------------------------------------------------------------------------

export async function getUserId(adminToken: string, username: string): Promise<string> {
	const filter = encodeURIComponent(`username = "${username}"`);
	const res = await fetch(
		`${PB_URL}/api/collections/users/records?filter=${filter}&perPage=1`,
		{ headers: { Authorization: adminToken } }
	);

	if (!res.ok) {
		throw new Error(`User lookup failed (${res.status})`);
	}

	const data = await res.json();
	if (!data.items || data.items.length === 0) {
		throw new Error(`User "${username}" not found in PocketBase`);
	}

	return data.items[0].id as string;
}

// ---------------------------------------------------------------------------
// Session lookup
// ---------------------------------------------------------------------------

/**
 * Return the ID of the first (most recently created) game session for a user.
 * Throws if the user has no sessions.
 */
export async function getFirstSessionId(adminToken: string, userId: string): Promise<string> {
	const filter = encodeURIComponent(`user = "${userId}"`);
	const res = await fetch(
		`${PB_URL}/api/collections/game_sessions/records?filter=${filter}&sort=-created&perPage=1`,
		{ headers: { Authorization: adminToken } }
	);

	if (!res.ok) {
		throw new Error(`Session lookup failed (${res.status})`);
	}

	const data = await res.json();
	if (!data.items || data.items.length === 0) {
		throw new Error(`No game sessions found for user ${userId}`);
	}

	return data.items[0].id as string;
}

// ---------------------------------------------------------------------------
// Node reset
// ---------------------------------------------------------------------------

/**
 * Reset all map_nodes for a session to the baseline:
 *   - First `availableCount` nodes (sorted by ap_location_id) → "Available"
 *   - All remaining nodes                                      → "Hidden"
 *
 * Existing "Checked" nodes are reset to "Hidden" (or "Available" if within
 * the first `availableCount`).
 */
export async function resetSessionNodes(
	adminToken: string,
	sessionId: string,
	availableCount = BASELINE_AVAILABLE
): Promise<void> {
	// Fetch all nodes sorted by their AP location ID
	const filter = encodeURIComponent(`session = "${sessionId}"`);
	const res = await fetch(
		`${PB_URL}/api/collections/map_nodes/records?filter=${filter}&sort=ap_location_id&perPage=200`,
		{ headers: { Authorization: adminToken } }
	);

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`map_nodes fetch failed (${res.status}): ${text}`);
	}

	const data = await res.json();
	const nodes: Array<{ id: string; state: string }> = data.items;

	if (nodes.length === 0) {
		console.warn(`[reset-db] Session ${sessionId} has no map_nodes — nothing to reset.`);
		return;
	}

	const updates = nodes.map((node, idx) => {
		const targetState = idx < availableCount ? 'Available' : 'Hidden';
		return { id: node.id, currentState: node.state, targetState };
	});

	// Only patch nodes that are already in the wrong state
	const toUpdate = updates.filter(u => u.currentState !== u.targetState);

	await Promise.all(
		toUpdate.map(u =>
			fetch(`${PB_URL}/api/collections/map_nodes/records/${u.id}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: adminToken,
				},
				body: JSON.stringify({ state: u.targetState }),
			})
		)
	);

	const hidden    = updates.filter(u => u.targetState === 'Hidden').length;
	const available = updates.filter(u => u.targetState === 'Available').length;
	console.log(
		`[reset-db] Session ${sessionId}: reset ${nodes.length} nodes → ` +
		`${available} Available, ${hidden} Hidden, 0 Checked (patched ${toUpdate.length} records)`
	);
}

// ---------------------------------------------------------------------------
// Convenience: reset testuser's first session
// ---------------------------------------------------------------------------

/**
 * Top-level helper for beforeEach hooks.
 * Authenticates as admin, finds testuser's first session, resets its nodes.
 *
 * @returns The session ID that was reset.
 */
export async function resetGameDb(
	username = 'testuser',
	availableCount = BASELINE_AVAILABLE
): Promise<string> {
	const adminToken = await getAdminToken();
	const userId     = await getUserId(adminToken, username);
	const sessionId  = await getFirstSessionId(adminToken, userId);
	await resetSessionNodes(adminToken, sessionId, availableCount);
	return sessionId;
}

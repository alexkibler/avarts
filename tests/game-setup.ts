/**
 * PocketBase fixture helpers for E2E tests.
 *
 * Creates and tears down a full game baseline:
 *   - A test user account
 *   - A game_sessions record
 *   - 10 map_nodes (3 Available, 7 Hidden)
 *
 * Usage in tests:
 *
 *   let ctx: GameTestContext;
 *
 *   test.beforeAll(async () => { ctx = await setupTestGame(); });
 *   test.afterAll(async ()  => { await ctx.teardown(); });
 *   test.beforeEach(async () => { await resetSessionNodes(ctx.adminToken, ctx.sessionId); });
 */

import { PB_URL, getAdminToken } from './admin';
import { createTestUser, generateTestCredentials, cleanupTestUser } from './e2e/helpers';

// ---------------------------------------------------------------------------
// Default fixture data — Pittsburgh, PA (within GraphHopper's loaded region)
// ---------------------------------------------------------------------------

const DEFAULT_CENTER_LAT = 40.4406;
const DEFAULT_CENTER_LON = -79.9959;
const DEFAULT_RADIUS     = 5000;

/**
 * 10 cycling-intersection-like nodes in a grid around downtown Pittsburgh.
 * First 3 will be seeded as "Available"; the rest as "Hidden".
 */
const DEFAULT_NODES: Array<{ lat: number; lon: number }> = [
	{ lat: 40.4414, lon: -79.9967 }, // 800001 — Available
	{ lat: 40.4414, lon: -79.9951 }, // 800002 — Available
	{ lat: 40.4406, lon: -79.9967 }, // 800003 — Available
	{ lat: 40.4406, lon: -79.9951 }, // 800004 — Hidden
	{ lat: 40.4398, lon: -79.9967 }, // 800005 — Hidden
	{ lat: 40.4398, lon: -79.9951 }, // 800006 — Hidden
	{ lat: 40.4414, lon: -79.9943 }, // 800007 — Hidden
	{ lat: 40.4406, lon: -79.9943 }, // 800008 — Hidden
	{ lat: 40.4398, lon: -79.9943 }, // 800009 — Hidden
	{ lat: 40.4390, lon: -79.9959 }, // 800010 — Hidden
];

const BASELINE_AVAILABLE = 3;

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

export interface CreateSessionOpts {
	ap_seed_name?: string;
	ap_slot_name?: string;
	center_lat?:   number;
	center_lon?:   number;
	radius?:       number;
	status?:       'Active' | 'Completed';
}

/**
 * Create a game_sessions record owned by `userId`.
 * Returns the new session ID.
 */
export async function createGameSession(
	adminToken: string,
	userId:     string,
	opts:       CreateSessionOpts = {}
): Promise<string> {
	// Verify user exists before creating session
	const userCheck = await fetch(`${PB_URL}/api/collections/users/records/${userId}`, {
		headers: { Authorization: adminToken },
	});

	if (!userCheck.ok) {
		throw new Error(`User ${userId} not found (${userCheck.status}): ${await userCheck.text()}`);
	}

	const body = {
		user:          userId,
		ap_seed_name:  opts.ap_seed_name ?? 'E2E Test Seed',
		ap_slot_name:  opts.ap_slot_name ?? 'TestSlot',
		ap_server_url: 'test',
		center_lat:    opts.center_lat   ?? DEFAULT_CENTER_LAT,
		center_lon:    opts.center_lon   ?? DEFAULT_CENTER_LON,
		radius:        opts.radius       ?? DEFAULT_RADIUS,
		status:        opts.status       ?? 'Active',
	};

	const res = await fetch(`${PB_URL}/api/collections/game_sessions/records`, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json', Authorization: adminToken },
		body:    JSON.stringify(body),
	});

	if (!res.ok) {
		const text = await res.text();
		console.error('createGameSession failed. Status:', res.status);
		console.error('User ID:', userId);
		console.error('Request body:', JSON.stringify(body, null, 2));
		console.error('Response:', text);
		throw new Error(`createGameSession failed (${res.status}): ${text}`);
	}

	const data = await res.json();
	return data.id as string;
}

// ---------------------------------------------------------------------------
// Node creation
// ---------------------------------------------------------------------------

export interface NodeSpec {
	ap_location_id: number;
	osm_node_id:    string;
	lat:            number;
	lon:            number;
	state:          'Hidden' | 'Available' | 'Checked';
}

/**
 * Create a single map_nodes record linked to `sessionId`.
 * Returns the new node ID.
 */
export async function createMapNode(
	adminToken: string,
	sessionId:  string,
	node:       NodeSpec
): Promise<string> {
	const res = await fetch(`${PB_URL}/api/collections/map_nodes/records`, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json', Authorization: adminToken },
		body:    JSON.stringify({ session: sessionId, ...node }),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`createMapNode failed (${res.status}): ${text}`);
	}

	const data = await res.json();
	return data.id as string;
}

// ---------------------------------------------------------------------------
// Baseline session (session + 10 nodes)
// ---------------------------------------------------------------------------

export interface BaselineSessionResult {
	sessionId: string;
	nodeIds:   string[];
}

/**
 * Create a game session + 10 map nodes in the baseline state:
 *   3 Available · 7 Hidden · 0 Checked
 *
 * Nodes are Pittsburgh defaults unless overridden via `opts`.
 */
export async function createBaselineSession(
	adminToken: string,
	userId:     string,
	opts:       CreateSessionOpts = {}
): Promise<BaselineSessionResult> {
	const sessionId = await createGameSession(adminToken, userId, opts);

	const nodeIds = await Promise.all(
		DEFAULT_NODES.map((coords, idx) =>
			createMapNode(adminToken, sessionId, {
				ap_location_id: 800001 + idx,
				osm_node_id:    `e2e_node_${800001 + idx}`,
				lat:            coords.lat,
				lon:            coords.lon,
				state:          idx < BASELINE_AVAILABLE ? 'Available' : 'Hidden',
			})
		)
	);

	console.log(
		`[game-setup] Created session ${sessionId} with ${nodeIds.length} nodes ` +
		`(${BASELINE_AVAILABLE} Available, ${nodeIds.length - BASELINE_AVAILABLE} Hidden)`
	);

	return { sessionId, nodeIds };
}

// ---------------------------------------------------------------------------
// Session deletion
// ---------------------------------------------------------------------------

/**
 * Delete a game session. map_nodes are cascade-deleted automatically.
 */
export async function deleteGameSession(adminToken: string, sessionId: string): Promise<void> {
	const res = await fetch(`${PB_URL}/api/collections/game_sessions/records/${sessionId}`, {
		method:  'DELETE',
		headers: { Authorization: adminToken },
	});

	if (!res.ok && res.status !== 404) {
		const text = await res.text();
		console.warn(`[game-setup] deleteGameSession failed (${res.status}): ${text}`);
	}
}

// ---------------------------------------------------------------------------
// Top-level orchestrator
// ---------------------------------------------------------------------------

export interface GameTestContext {
	adminToken:  string;
	userId:      string;
	sessionId:   string;
	credentials: { username: string; password: string; name: string };
	teardown:    () => Promise<void>;
}

/**
 * Set up a complete game test environment:
 *   1. Authenticate as admin
 *   2. Create a fresh test user
 *   3. Create a game session + 10 baseline nodes
 *
 * Call in test.beforeAll(). Call ctx.teardown() in test.afterAll().
 * The teardown deletes the user, which cascade-deletes the session and all nodes.
 *
 * In test.beforeEach(), call resetSessionNodes(ctx.adminToken, ctx.sessionId)
 * to reset node states between tests without recreating everything.
 */
export async function setupTestGame(opts: CreateSessionOpts = {}): Promise<GameTestContext> {
	const adminToken  = await getAdminToken();
	const credentials = generateTestCredentials();
	const userId      = await createTestUser(adminToken, credentials);
	const { sessionId } = await createBaselineSession(adminToken, userId, opts);

	const teardown = async () => {
		// cleanupTestUser deletes the user record, which cascade-deletes game_sessions → map_nodes
		await cleanupTestUser(adminToken, userId);
		console.log(`[game-setup] Torn down test user ${credentials.username} and all fixtures`);
	};

	return { adminToken, userId, sessionId, credentials, teardown };
}

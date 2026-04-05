import { Client } from '@airbreather/archipelago.js';
import { pb } from '$lib/database';
import { writable } from 'svelte/store';
import { env } from '$env/dynamic/public';

export const apClient = new Client();

export type ChatMessageType = 'chat' | 'item' | 'system' | 'server';
export interface ChatMessage {
	id: number;
	text: string;
	type: ChatMessageType;
}

export const chatMessages = writable<ChatMessage[]>([]);

// Goal reached state from Archipelago server
export const isGoalReached = writable<boolean>(false);

if (typeof window !== 'undefined' && (env.PUBLIC_MOCK_MODE === 'true' || (window as any).PLAYWRIGHT_TEST)) {
	(window as any).isGoalReached = isGoalReached;
}

// Location Swap has ID START_ID + MAX_CHECKS + 3 = 802003
export const locationSwaps = writable<number>(0);

let _activeSessionId = '';
let _msgId = 0;
const _hooksRegistered = false;
let _pendingType: ChatMessageType = 'server';
let _listenersRegistered = false;
let _listenerUnsubscribers: Array<() => void> = [];

// Connection context for session identification (RoomInfo composite key)
let _connectedUrl = '';
let _connectedSlotName = '';

// Test mode variables
let _testMode = false;
let _testSessionId = '';

// Sync state management to prevent concurrent reconciliation and auto-cancellation
let _isSyncing = false;
let _hasPendingSync = false;

/**
 * Unregister all previously registered event listeners.
 * Useful for reconnection scenarios where listeners need to be cleared.
 */
function teardownListeners() {
	_listenerUnsubscribers.forEach((unsub) => unsub());
	_listenerUnsubscribers = [];
	_listenersRegistered = false;
}

/**
 * Register event listeners on the singleton apClient once.
 * Handles both initial connection and reconnection scenarios.
 * Listeners are stored so they can be torn down and re-registered if needed.
 */
function setupListeners() {
	if (_listenersRegistered) return;
	_listenersRegistered = true;

	// Generic message hooks
	apClient.messages.on('itemSent', () => {
		_pendingType = 'item';
	});
	apClient.messages.on('itemCheated', () => {
		_pendingType = 'item';
	});
	apClient.messages.on('itemHinted', () => {
		_pendingType = 'item';
	});
	apClient.messages.on('chat', () => {
		_pendingType = 'chat';
	});
	apClient.messages.on('connected', () => {
		_pendingType = 'system';
		isGoalReached.set(false); // Reset goal state on new connection
	});
	apClient.messages.on('disconnected', () => {
		_pendingType = 'system';
	});
	apClient.messages.on('goaled', (text, player) => {
		_pendingType = 'system';
		// If the player reaching the goal is the local player, trigger victory!
		if (player.slot === apClient.data.slot) {
			console.log('[AP] Local player reached the goal!');
			isGoalReached.set(true);
		}
	});
	apClient.messages.on('released', () => {
		_pendingType = 'system';
	});
	apClient.messages.on('collected', () => {
		_pendingType = 'system';
	});

	apClient.messages.on('message', (text: string) => {
		chatMessages.update((msgs) => [...msgs, { id: ++_msgId, text, type: _pendingType }]);
		_pendingType = 'server';
	});

	// Data sync hooks
	apClient.items.on('itemsReceived', async () => {
		await syncArchipelagoState(_activeSessionId);
	});

	apClient.room.on('locationsChecked', async () => {
		await syncArchipelagoState(_activeSessionId);
	});
}

export interface ApConnectionOptions {
	url: string; // e.g. "archipelago.gg:64962"
	game: string;
	name: string;
	password?: string;
	sessionId: string; // PocketBase game_session id
}

/**
 * Establishes connection to an Archipelago server and syncs state.
 *
 * Flow:
 * 1. Registers event listeners (itemsReceived, locationsChecked) once per session
 * 2. Connects to AP server via apClient.login()
 * 3. Performs initial full state sync to reconcile DB with current AP state
 *
 * Reconnection Note:
 * - If AP connection drops and reconnects, the apClient may automatically reconnect
 * - Event listeners remain registered and will continue to trigger syncs
 * - If listeners stop working after reconnection, consider calling connectToAp() again
 *   or explicitly calling teardownListeners() + setupListeners()
 *
 * Initial Sync Timing:
 * - syncArchipelagoState() is called immediately after successful login
 * - At this point, apClient.items.received should be populated from the AP server
 * - If items are not ready, the sync will see them as empty and reconcile as Hidden
 * - When AP broadcasts itemsReceived event, listeners will trigger another sync
 *
 * @param options - Connection options (url, game, name, password, sessionId)
 * @returns true on success, false on failure
 */
export async function connectToAp(options: ApConnectionOptions) {
	setupListeners();
	_activeSessionId = options.sessionId;
	_connectedUrl = options.url;
	_connectedSlotName = options.name;

	const connectionOptions: any = {
		slotData: true,
		version: {
			major: 0,
			minor: 6,
			build: 2
		}
	};

	if (options.password) {
		connectionOptions.password = options.password;
	}

	const cleanUrl = options.url.trim();
	const isLocalhost = cleanUrl.toLowerCase().includes('localhost') || cleanUrl.includes('127.0.0.1');

	let finalUrl = cleanUrl;
	if (isLocalhost) {
		// Prepend ws:// if no protocol is present, to avoid the library trying wss://
		// which we know will fail on localhost and log a console error.
		if (!cleanUrl.startsWith('ws://') && !cleanUrl.startsWith('wss://')) {
			finalUrl = 'ws://' + cleanUrl;
		}
	} else {
		// For remote servers, stripping protocol allows the library to try wss:// then ws://
		finalUrl = cleanUrl.replace(/^wss?:\/\//i, '');
	}

	// Test environment bypass checks BOTH 'test' url and global test engine flag
	const isTestForce =
		(typeof globalThis !== 'undefined' && (globalThis as any).PLAYWRIGHT_TEST) ||
		(typeof window !== 'undefined' && (window as any).PLAYWRIGHT_TEST);
	const isMockMode = env.PUBLIC_MOCK_MODE === 'true';

	if (finalUrl === 'test' || finalUrl === 'ws://test' || isTestForce || isMockMode) {
		console.log('[AP] Test/Mock mode bypass engaged.');
		_testMode = true;
		_testSessionId = options.sessionId;
		return true;
	}

	try {
		console.log(`[AP] Connecting to: ${finalUrl} as ${options.name}`);

		await apClient.login(finalUrl, options.name, options.game, connectionOptions);

		console.log('[AP] Connected successfully!');
		console.log(
			`[AP] Items received: ${apClient.items.received.length}, Checked locations: ${apClient.room.checkedLocations.length}`
		);

		// Perform initial full sync
		// At this point, apClient.items.received should be populated from AP server
		await syncArchipelagoState(options.sessionId);

		return true;
	} catch (error: any) {
		console.error('[AP] Failed to connect:', error?.message ?? error);
		// Log more details if available
		if (error?.stack) console.error(error.stack);
		return false;
	}
}

/**
 * Reconciles the local PocketBase state with the current Archipelago state.
 *
 * CRITICAL: This is the source-of-truth reconciliation function.
 * - AP server is the source-of-truth (apClient.items.received, apClient.room.checkedLocations)
 * - PocketBase map_nodes table is reconciled to match AP state
 * - Uses ID-based matching (not count-based) to handle non-sequential item distribution
 *
 * State priority:
 * 1. If location ID is in apClient.room.checkedLocations → state = 'Checked'
 * 2. Else if location ID is in apClient.items.received → state = 'Available'
 * 3. Else → state = 'Hidden'
 *
 * @param sessionId - PocketBase game_session ID to reconcile
 *
 * @throws Logs errors but doesn't throw (graceful degradation)
 */
async function syncArchipelagoState(sessionId: string) {
	if (!sessionId || sessionId !== _activeSessionId) return;

	if (_isSyncing) {
		_hasPendingSync = true;
		return;
	}

	_isSyncing = true;
	try {
		do {
			_hasPendingSync = false;
			await _doSyncArchipelagoState(_activeSessionId);
		} while (_hasPendingSync);
	} finally {
		_isSyncing = false;
	}
}

async function _doSyncArchipelagoState(sessionId: string) {
	try {
		const [nodes, session] = await Promise.all([
			pb.collection('map_nodes').getFullList({
				filter: `session = "${sessionId}"`,
				sort: '+ap_location_id',
				requestKey: null
			}),
			pb.collection('game_sessions').getOne(sessionId, {
				requestKey: null
			})
		]);

		const checkedLocationIds = apClient.room.checkedLocations;
		const receivedItems = apClient.items.received;

		const receivedItemIds = new Set(receivedItems.map((i: any) => i.id));

		// Create a set of updates to perform
		const updates: Promise<any>[] = [];
		let updateCount = 0;

		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			let newState: 'Hidden' | 'Available' | 'Checked' = 'Hidden';

			const isChecked = checkedLocationIds.includes(node.ap_location_id);
			const isUnlockedByItem = receivedItemIds.has(node.ap_location_id);

			if (isChecked) {
				newState = 'Checked';
			} else if (isUnlockedByItem) {
				newState = 'Available';
			} else {
				newState = 'Hidden';
			}

			if (node.state !== newState) {
				console.log(
					`[AP Sync] Correcting node ${node.ap_location_id} from ${node.state} to ${newState}`
				);
				updates.push(
					pb.collection('map_nodes').update(node.id, { state: newState }, { requestKey: null })
				);
				updateCount++;
			}
		}

		if (updates.length > 0) {
			await Promise.all(updates);
		}

		// Warn if there's a significant mismatch between local nodes and AP items
		if (nodes.length !== receivedItemIds.size) {
			console.warn(
				`[AP Sync] Node count mismatch: bikeapelago has ${nodes.length} nodes, ` +
					`but AP provides ${receivedItemIds.size} unlockable items. ` +
					`This may indicate the session was created with a different check count than the AP multiworld expects.`
			);
		}

		// Sync Location Swaps
		const totalSwapsFound = receivedItems.filter((i: any) => i.id === 802003).length;
		const usedSwaps = session.location_swaps_used || 0;
		locationSwaps.set(Math.max(0, totalSwapsFound - usedSwaps));

		console.log(
			`[AP Sync] Session ${sessionId} reconciled: ${checkedLocationIds.length} checked, ` +
				`${receivedItemIds.size} total unlocked items, ${updateCount} state updates applied.`
		);
	} catch (e) {
		console.error('[AP Sync] Error during state reconciliation:', e);
	}
}

/**
 * Validates that the local nodes match the AP multiworld item count.
 *
 * Returns diagnostics about potential mismatches:
 * - If counts differ significantly, returns a warning message
 * - If counts match, returns null
 *
 * This should be called after connectToAp() succeeds to validate the session setup.
 *
 * @param nodeCount - Number of map_nodes for this session (from DB)
 * @returns Warning message if mismatch detected, null if counts match
 */
export function validateNodeCountVsApItems(nodeCount: number): string | null {
	const apItemCount = apClient.items.received.length;

	if (nodeCount === apItemCount) {
		return null;
	}

	const diff = Math.abs(nodeCount - apItemCount);
	const percentDiff = Math.round((diff / Math.max(nodeCount, apItemCount)) * 100);

	if (percentDiff > 20) {
		// Significant mismatch (>20% difference)
		return (
			`Significant mismatch detected: bikeapelago has ${nodeCount} nodes, ` +
			`but Archipelago provides ${apItemCount} items. ` +
			`This session may have been created with an incorrect check count. ` +
			`Nodes without corresponding AP items will never unlock, and AP items without nodes cannot be found.`
		);
	}

	if (nodeCount < apItemCount) {
		return (
			`Bikeapelago has ${nodeCount} nodes, but Archipelago has ${apItemCount} items. ` +
			`${apItemCount - nodeCount} items cannot be collected on this map.`
		);
	}

	// nodeCount > apItemCount
	return (
		`Bikeapelago has ${nodeCount} nodes, but Archipelago only has ${apItemCount} items. ` +
		`${nodeCount - apItemCount} nodes will never unlock.`
	);
}

/**
 * Extracts a unique session identifier from RoomInfo (available after successful AP login).
 *
 * Returns a composite key that uniquely identifies an AP session:
 * - seed_name: Stable identifier for this multiworld (from RoomInfo.seedName)
 * - server_url: Which Archipelago server (from connection attempt)
 * - slot_name: Which player slot (from connection attempt)
 *
 * Can be used to check if a session already exists in the database before setup.
 * Returns null if not authenticated or connection details not stored.
 *
 * @returns Session key object with seed_name, server_url, slot_name, or null if unavailable
 */
export function getRoomInfoSessionKey(): {
	seed_name: string;
	server_url: string;
	slot_name: string;
} | null {
	if (!apClient.authenticated || !_connectedUrl || !_connectedSlotName) {
		return null;
	}

	return {
		seed_name: apClient.room.seedName,
		server_url: _connectedUrl,
		slot_name: _connectedSlotName
	};
}

/**
 * Gets the current AP connection state summary for logging/debugging.
 * @returns Summary of items received and checked locations
 */
export function getApConnectionState(): {
	itemsReceived: number;
	checkedLocations: number;
	authenticated: boolean;
} {
	return {
		itemsReceived: apClient.items.received.length,
		checkedLocations: apClient.room.checkedLocations.length,
		authenticated: apClient.authenticated
	};
}

export function sendLocationChecks(locationIds: number[]) {
	if (_testMode) {
		console.log(`[AP] Test mode: MOCKING ${locationIds.length} location checks.`);
		setTimeout(async () => {
			try {
				// Step 1: Mark each checked location as Checked (idempotent — validation.ts may have
				// already done this, but we ensure consistency if sendLocationChecks is called directly).
				const nodesInSession = await pb.collection('map_nodes').getFullList({
					filter: `session = "${_testSessionId}"`,
					requestKey: null
				});

				const nodesToMarkChecked = nodesInSession.filter(
					(node: any) => locationIds.includes(node.ap_location_id) && node.state !== 'Checked'
				);

				if (nodesToMarkChecked.length > 0) {
					await Promise.all(
						nodesToMarkChecked.map((node) =>
							pb.collection('map_nodes').update(node.id, { state: 'Checked' }, { requestKey: null })
						)
					);
					nodesToMarkChecked.forEach((node) =>
						console.log(`[AP Mock] Marked node ${node.id} (loc ${node.ap_location_id}) as Checked`)
					);
				}

				// Step 2: Simulate receiving one unlock item per checked location.
				const hiddenNodes = await pb.collection('map_nodes').getFullList({
					filter: `session = "${_testSessionId}" && state = "Hidden"`,
					sort: '+ap_location_id',
					requestKey: null
				});

				const nodesToUnlockMock = hiddenNodes.slice(0, locationIds.length);

				if (nodesToUnlockMock.length > 0) {
					await Promise.all(
						nodesToUnlockMock.map((node) =>
							pb
								.collection('map_nodes')
								.update(node.id, { state: 'Available' }, { requestKey: null })
						)
					);
					nodesToUnlockMock.forEach((node) =>
						console.log(`[AP Mock] Unlocked node ${node.id} to Available`)
					);
				}

				// Check if session is now fully complete (0 Hidden, 0 Available)
				const remaining = await pb.collection('map_nodes').getFullList({
					filter: `session = "${_testSessionId}" && state != "Checked"`,
					requestKey: null
				});

				if (remaining.length === 0) {
					console.log('[AP Mock] All nodes cleared! Triggering goal reached.');
					await pb.collection('game_sessions').update(_testSessionId, { status: 'Completed' });
					isGoalReached.set(true);
				}
			} catch (e) {
				console.error('Mock unlock failed', e);
			}
		}, 500);
		return;
	}

	if (apClient.authenticated) {
		apClient.check(...locationIds);
	} else {
		console.error('Cannot send checks — client is not authenticated.');
	}
}

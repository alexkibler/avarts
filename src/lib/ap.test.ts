import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectToAp, apClient, sendLocationChecks } from './ap';
import { pb } from '$lib/database';

vi.mock('$lib/database', () => ({
	pb: {
		collection: vi.fn(() => ({
			getFullList: vi.fn(),
			update: vi.fn()
		}))
	}
}));

vi.mock('@airbreather/archipelago.js', () => {
	return {
		Client: class {
			login = vi.fn();
			check = vi.fn();
			authenticated = false;
			items = {
				received: [],
				on: vi.fn()
			};
			messages = {
				on: vi.fn()
			};
			room = {
				checkedLocations: [] as number[],
				on: vi.fn()
			};
		}
	};
});

// Since processReceivedItems is not exported, we test it through connectToAp's initial call.
describe('ap.ts module', () => {
	let getFullListMock: any;
	let updateMock: any;

	let getOneMock: any;

	beforeEach(() => {
		vi.clearAllMocks();

		getFullListMock = vi.fn().mockResolvedValue([]);
		updateMock = vi.fn().mockResolvedValue({});
		getOneMock = vi.fn().mockResolvedValue({ location_swaps_used: 0 });
		(pb.collection as any).mockReturnValue({
			getFullList: getFullListMock,
			update: updateMock,
			getOne: getOneMock
		});

		// Reset client mocked values
		(apClient.login as any).mockResolvedValue(true);
		(apClient as any).authenticated = false;
		(apClient as any).items.received = [];
		(apClient as any).room.checkedLocations = [];
		// reset global PLAYWRIGHT_TEST
		(globalThis as any).PLAYWRIGHT_TEST = false;
	});

	describe('connectToAp', () => {
		it('bypasses connection when cleanUrl is test', async () => {
			const result = await connectToAp({
				url: 'test',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			expect(result).toBe(true);
			expect(apClient.login).not.toHaveBeenCalled();
		});

		it('bypasses connection when PLAYWRIGHT_TEST is set', async () => {
			(globalThis as any).PLAYWRIGHT_TEST = true;
			const result = await connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			expect(result).toBe(true);
			expect(apClient.login).not.toHaveBeenCalled();
		});

		it('successfully connects with valid options and password', async () => {
			const result = await connectToAp({
				url: 'wss://archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				password: 'secret-password',
				sessionId: 'session-id'
			});

			expect(result).toBe(true);
			expect(apClient.login).toHaveBeenCalledWith(
				'archipelago.gg:38281',
				'player1',
				'test-game',
				expect.objectContaining({ password: 'secret-password' })
			);
		});

		it('handles connection failure and logs error', async () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			(apClient.login as any).mockRejectedValue(new Error('Connection timeout'));

			const result = await connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			expect(result).toBe(false);
			expect(consoleSpy).toHaveBeenCalledWith('[AP] Failed to connect:', 'Connection timeout');
			consoleSpy.mockRestore();
		});
	});

	describe('syncArchipelagoState via connectToAp', () => {
		it('queries map_nodes and game_sessions even when counts are 0', async () => {
			(apClient as any).items.received = [];
			(apClient as any).room.checkedLocations = [];

			await connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			expect(pb.collection).toHaveBeenCalledWith('game_sessions');
			expect(pb.collection).toHaveBeenCalledWith('map_nodes');
			expect(updateMock).not.toHaveBeenCalled();
		});

		it('corrects node states to match Archipelago ground truth (ID-based Available)', async () => {
			(apClient as any).items.received = [{ id: 800001 }, { id: 800003 }]; // Items for 1 and 3
			(apClient as any).room.checkedLocations = [];

			getFullListMock.mockResolvedValue([
				{ id: 'node1', ap_location_id: 800001, state: 'Hidden' }, // Has item -> Available
				{ id: 'node2', ap_location_id: 800002, state: 'Available' }, // No item -> Hidden
				{ id: 'node3', ap_location_id: 800003, state: 'Hidden' } // Has item -> Available
			]);

			await connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			expect(updateMock).toHaveBeenCalledWith('node1', { state: 'Available' }, { requestKey: null });
			expect(updateMock).toHaveBeenCalledWith('node2', { state: 'Hidden' }, { requestKey: null });
			expect(updateMock).toHaveBeenCalledWith('node3', { state: 'Available' }, { requestKey: null });
			expect(updateMock).toHaveBeenCalledTimes(3);
		});

		it('corrects node states to match Archipelago ground truth (Checked)', async () => {
			(apClient as any).items.received = [{ id: 800001 }];
			(apClient as any).room.checkedLocations = [800001, 800002]; // 800002 checked without item (e.g. admin/cheat)

			getFullListMock.mockResolvedValue([
				{ id: 'node1', ap_location_id: 800001, state: 'Available' }, // Should become Checked
				{ id: 'node2', ap_location_id: 800002, state: 'Hidden' }, // Should become Checked
				{ id: 'node3', ap_location_id: 800003, state: 'Available' } // Should become Hidden (no item)
			]);

			await connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			expect(updateMock).toHaveBeenCalledWith('node1', { state: 'Checked' }, { requestKey: null });
			expect(updateMock).toHaveBeenCalledWith('node2', { state: 'Checked' }, { requestKey: null });
			expect(updateMock).toHaveBeenCalledWith('node3', { state: 'Hidden' }, { requestKey: null });
		});

		it('registers event listeners via setupListeners', async () => {
			// Use fresh module state to test registration
			vi.resetModules();
			const apModule = await import('./ap');

			const onSpy = vi.spyOn(apModule.apClient.room, 'on');

			await apModule.connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			expect(onSpy).toHaveBeenCalledWith('locationsChecked', expect.any(Function));
		});
	});

	describe('sendLocationChecks', () => {
		beforeEach(() => {
			// Reset the testMode module level variable for each test by importing
			// a fresh state. However we can't easily reset internal module vars
			// without a full re-import, so we'll just handle test mode manually.
		});

		it('mocks checks and updates PB correctly in test mode', async () => {
			vi.useFakeTimers();

			// Ensure we are in test mode
			await connectToAp({
				url: 'test',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			getFullListMock.mockImplementation((opts: any) => {
				if (opts?.filter?.includes('state = "Hidden"')) {
					return Promise.resolve([{ id: 'mock-node-2', ap_location_id: 999, state: 'Hidden' }]);
				}
				// Default: return all nodes in session (used by step 1)
				return Promise.resolve([{ id: 'mock-node-1', ap_location_id: 101, state: 'Available' }]);
			});

			sendLocationChecks([101]);

			await vi.runAllTimersAsync();

			expect(updateMock).toHaveBeenCalledWith('mock-node-1', { state: 'Checked' }, { requestKey: null });
			expect(updateMock).toHaveBeenCalledWith('mock-node-2', { state: 'Available' }, { requestKey: null });

			vi.useRealTimers();
		});

		it('calls apClient.check with the correct ids when authenticated', async () => {
			// Force test mode OFF for this call since it was turned ON by previous tests
			vi.resetModules();
			const apModule = await import('./ap');

			// We must avoid calling connectToAp with 'test' to not trigger test mode
			await apModule.connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			(apModule.apClient as any).authenticated = true;
			apModule.sendLocationChecks([101, 102]);

			expect(apModule.apClient.check).toHaveBeenCalledWith(101, 102);
		});

		it('logs an error when not authenticated', async () => {
			vi.resetModules();
			const apModule = await import('./ap');
			// Ensure NOT in test mode
			await apModule.connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			(apModule.apClient as any).authenticated = false;

			apModule.sendLocationChecks([101]);

			expect(consoleSpy).toHaveBeenCalledWith('Cannot send checks — client is not authenticated.');
			expect(apModule.apClient.check).not.toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});

	describe('Non-sequential item distribution', () => {
		it('correctly unlocks only nodes matching non-sequential item IDs', async () => {
			// AP grants items for locations 800001, 800003, 800005 (skipping 800002, 800004)
			// This simulates non-linear item distribution in a multiworld
			(apClient as any).items.received = [{ id: 800001 }, { id: 800003 }, { id: 800005 }];
			(apClient as any).room.checkedLocations = [];

			getFullListMock.mockResolvedValue([
				{ id: 'node1', ap_location_id: 800001, state: 'Hidden' }, // Has item -> Available
				{ id: 'node2', ap_location_id: 800002, state: 'Hidden' }, // No item -> Hidden
				{ id: 'node3', ap_location_id: 800003, state: 'Hidden' }, // Has item -> Available
				{ id: 'node4', ap_location_id: 800004, state: 'Hidden' }, // No item -> Hidden
				{ id: 'node5', ap_location_id: 800005, state: 'Hidden' } // Has item -> Available
			]);

			await connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			// Only nodes 1, 3, 5 should be updated to Available (those with items)
			expect(updateMock).toHaveBeenCalledWith('node1', { state: 'Available' }, { requestKey: null });
			expect(updateMock).toHaveBeenCalledWith('node3', { state: 'Available' }, { requestKey: null });
			expect(updateMock).toHaveBeenCalledWith('node5', { state: 'Available' }, { requestKey: null });
			// Nodes 2 and 4 should NOT be unlocked
			expect(updateMock).not.toHaveBeenCalledWith('node2', { state: 'Available' }, { requestKey: null });
			expect(updateMock).not.toHaveBeenCalledWith('node4', { state: 'Available' }, { requestKey: null });
		});

		it('handles gaps in item distribution with sparse AP items', async () => {
			// Extreme case: AP only grants items 800001 and 800050
			(apClient as any).items.received = [{ id: 800001 }, { id: 800050 }];
			(apClient as any).room.checkedLocations = [];

			getFullListMock.mockResolvedValue([
				{ id: 'node1', ap_location_id: 800001, state: 'Hidden' },
				{ id: 'node2', ap_location_id: 800010, state: 'Hidden' },
				{ id: 'node3', ap_location_id: 800050, state: 'Hidden' }
			]);

			await connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			// Only nodes with items should be updated
			expect(updateMock).toHaveBeenCalledWith('node1', { state: 'Available' }, { requestKey: null });
			expect(updateMock).toHaveBeenCalledWith('node3', { state: 'Available' }, { requestKey: null });
			// Node 2 has no item and starts as Hidden, so no update needed
			expect(updateMock).toHaveBeenCalledTimes(2);
		});
	});

	describe('Node count mismatch scenarios', () => {
		it('handles case where bikeapelago has fewer nodes than AP items', async () => {
			// AP has items 800001-800050, but bikeapelago only created nodes for 800001-800010
			(apClient as any).items.received = Array.from({ length: 50 }, (_, i) => ({ id: 800001 + i }));
			(apClient as any).room.checkedLocations = [];

			// Only 10 nodes exist locally
			getFullListMock.mockResolvedValue(
				Array.from({ length: 10 }, (_, i) => ({
					id: `node${i + 1}`,
					ap_location_id: 800001 + i,
					state: 'Hidden'
				}))
			);

			const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			await connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			// All 10 local nodes should be unlocked (they match AP items)
			expect(updateMock).toHaveBeenCalledTimes(10);
			expect(updateMock).toHaveBeenCalledWith('node1', { state: 'Available' }, { requestKey: null });
			expect(updateMock).toHaveBeenCalledWith('node10', { state: 'Available' }, { requestKey: null });

			// Sync should log that AP has more items than local nodes
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('reconciled: 0 checked, 50 total unlocked items')
			);

			consoleSpy.mockRestore();
		});

		it('handles case where bikeapelago has more nodes than AP items', async () => {
			// AP has items 800001-800010, but bikeapelago created nodes for 800001-800050
			(apClient as any).items.received = Array.from({ length: 10 }, (_, i) => ({ id: 800001 + i }));
			(apClient as any).room.checkedLocations = [];

			// 50 nodes exist locally
			getFullListMock.mockResolvedValue(
				Array.from({ length: 50 }, (_, i) => ({
					id: `node${i + 1}`,
					ap_location_id: 800001 + i,
					state: 'Hidden'
				}))
			);

			await connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			// Only first 10 nodes should be updated (to Available - they have AP items)
			// Nodes 11-50 already start as Hidden, so no update needed
			for (let i = 0; i < 10; i++) {
				expect(updateMock).toHaveBeenCalledWith(`node${i + 1}`, { state: 'Available' }, { requestKey: null });
			}

			// Total calls should be 10 (only the unlockable nodes)
			expect(updateMock).toHaveBeenCalledTimes(10);
		});
	});

	describe('Initial state and timing', () => {
		it('handles sync when AP items are initially empty', async () => {
			// Simulate AP not having items ready on first sync
			(apClient as any).items.received = [];
			(apClient as any).room.checkedLocations = [];

			getFullListMock.mockResolvedValue([{ id: 'node1', ap_location_id: 800001, state: 'Hidden' }]);

			await connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			// With no items, node should stay Hidden (no state change needed)
			expect(updateMock).not.toHaveBeenCalled();
		});
	});

	describe('validateNodeCountVsApItems validation', () => {
		beforeEach(() => {
			// Ensure fresh import to avoid module state pollution
			vi.resetModules();
		});

		it('verifies validateNodeCountVsApItems validation logic', async () => {
			// Import fresh module to get clean state after resetModules
			const apModule = await import('./ap');
			const { validateNodeCountVsApItems } = apModule;
			const { apClient: freshApClient } = apModule;

			// Test 1: Exact match
			(freshApClient as any).items.received = Array.from({ length: 10 }, (_, i) => ({ id: 800001 + i }));
			expect(validateNodeCountVsApItems(10)).toBeNull();

			// Test 2: Significant mismatch (more nodes)
			(freshApClient as any).items.received = Array.from({ length: 10 }, (_, i) => ({ id: 800001 + i }));
			const warning2 = validateNodeCountVsApItems(50);
			expect(warning2).toContain('Significant mismatch');
			expect(warning2).toContain('50 nodes');
			expect(warning2).toContain('10 items');

			// Test 3: Fewer nodes than items (but small difference)
			(freshApClient as any).items.received = Array.from({ length: 11 }, (_, i) => ({ id: 800001 + i }));
			const warning3 = validateNodeCountVsApItems(10);
			expect(warning3).toContain('10 nodes');
			expect(warning3).toContain('11 items');
			expect(warning3).toContain('1 items cannot be collected');
		});
	});

	describe('Idempotency and resilience', () => {
		it('does not perform unnecessary updates when state already matches', async () => {
			(apClient as any).items.received = [{ id: 800001 }];
			(apClient as any).room.checkedLocations = [];

			getFullListMock.mockResolvedValue([
				{ id: 'node1', ap_location_id: 800001, state: 'Available' } // Already in correct state
			]);

			await connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			// Should not update since state already matches
			expect(updateMock).not.toHaveBeenCalled();
		});

		it('handles multiple rapid sync calls idempotently', async () => {
			(apClient as any).items.received = [{ id: 800001 }];
			(apClient as any).room.checkedLocations = [];

			getFullListMock.mockResolvedValue([{ id: 'node1', ap_location_id: 800001, state: 'Hidden' }]);

			await connectToAp({
				url: 'archipelago.gg:38281',
				game: 'test-game',
				name: 'player1',
				sessionId: 'session-id'
			});

			expect(updateMock).toHaveBeenCalledTimes(1);
			expect(updateMock).toHaveBeenCalledWith('node1', { state: 'Available' }, { requestKey: null });

			// Get the itemsReceived callback before clearing mocks
			const itemsReceivedCallback = (apClient.items.on as any).mock.calls.find(
				(call: any) => call[0] === 'itemsReceived'
			)?.[1];

			// Second sync call with same state should not trigger updates
			vi.clearAllMocks();
			getFullListMock.mockResolvedValue([
				{ id: 'node1', ap_location_id: 800001, state: 'Available' }
			]);

			// Trigger sync again via itemsReceived callback
			if (itemsReceivedCallback) {
				await itemsReceivedCallback();
			}

			expect(updateMock).not.toHaveBeenCalled();
		});
	});
});

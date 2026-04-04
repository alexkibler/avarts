import { Client } from '@airbreather/archipelago.js';
import { pb } from '$lib/pb';
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

// Location Swap has ID START_ID + MAX_CHECKS + 3 = 802003
export const locationSwaps = writable<number>(0);

let _activeSessionId = '';
let _msgId = 0;
let _hooksRegistered = false;
let _pendingType: ChatMessageType = 'server';
let _listenersRegistered = false;

// Test mode variables
let _testMode = false;
let _testSessionId = '';

/**
 * Register event listeners on the singleton apClient once.
 */
function setupListeners() {
  if (_listenersRegistered) return;
  _listenersRegistered = true;

  // Generic message hooks
  apClient.messages.on('itemSent',    () => { _pendingType = 'item'; });
  apClient.messages.on('itemCheated', () => { _pendingType = 'item'; });
  apClient.messages.on('itemHinted',  () => { _pendingType = 'item'; });
  apClient.messages.on('chat',        () => { _pendingType = 'chat'; });
  apClient.messages.on('connected',   () => { _pendingType = 'system'; });
  apClient.messages.on('disconnected',() => { _pendingType = 'system'; });
  apClient.messages.on('goaled',      () => { _pendingType = 'system'; });
  apClient.messages.on('released',    () => { _pendingType = 'system'; });
  apClient.messages.on('collected',   () => { _pendingType = 'system'; });

  apClient.messages.on('message', (text: string) => {
    chatMessages.update(msgs => [...msgs, { id: ++_msgId, text, type: _pendingType }]);
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
  url: string;      // e.g. "archipelago.gg:64962"
  game: string;
  name: string;
  password?: string;
  sessionId: string; // PocketBase game_session id
}

export async function connectToAp(options: ApConnectionOptions) {
  setupListeners();
  _activeSessionId = options.sessionId;

  const connectionOptions: any = {
    slotData: true,
    version: {
      major: 0,
      minor: 6,
      build: 2,
    },
  };

  if (options.password) {
    connectionOptions.password = options.password;
  }

  const cleanUrl = options.url.replace(/^wss?:\/\//i, '').trim();

  // Test environment bypass checks BOTH 'test' url and global test engine flag
  const isTestForce = (typeof globalThis !== 'undefined' && (globalThis as any).PLAYWRIGHT_TEST) || (typeof window !== 'undefined' && (window as any).PLAYWRIGHT_TEST);
  const isMockMode = env.PUBLIC_MOCK_MODE === 'true';

  if (cleanUrl === 'test' || isTestForce || isMockMode) {
      console.log('[AP] Test/Mock mode bypass engaged.');
      _testMode = true;
      _testSessionId = options.sessionId;
      return true;
  }

  try {
    console.log(`[AP] Connecting to: ${cleanUrl} as ${options.name}`);

    await apClient.login(
      cleanUrl,
      options.name,
      options.game,
      connectionOptions
    );

    console.log('[AP] Connected successfully!');

    // Perform initial full sync
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
 * Marks checked locations first, then unlocks the correct number of additional nodes.
 */
async function syncArchipelagoState(sessionId: string) {
  if (!sessionId || sessionId !== _activeSessionId) return;

  try {
    const [nodes, session] = await Promise.all([
      pb.collection('map_nodes').getFullList({
        filter: `session = "${sessionId}"`,
        sort: '+ap_location_id',
      }),
      pb.collection('game_sessions').getOne(sessionId)
    ]);

    const checkedLocationIds = apClient.room.checkedLocations;
    const receivedItems = apClient.items.received;

    const receivedItemIds = new Set(receivedItems.map((i: any) => i.id));
 
    // Create a set of updates to perform
    const updates: Promise<any>[] = [];
 
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
        console.log(`[AP Sync] Correcting node ${node.ap_location_id} from ${node.state} to ${newState}`);
        updates.push(pb.collection('map_nodes').update(node.id, { state: newState }));
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    // 3. Sync Location Swaps
    const totalSwapsFound = receivedItems.filter((i: any) => i.id === 802003).length;
    const usedSwaps = session.location_swaps_used || 0;
    locationSwaps.set(Math.max(0, totalSwapsFound - usedSwaps));

    console.log(`[AP Sync] Session ${sessionId} reconciled: ${checkedLocationIds.length} checked, ${receivedItemIds.size} total unlocked items.`);
  } catch (e) {
    console.error('[AP Sync] Error during state reconciliation:', e);
  }
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
        });

        const nodesToMarkChecked = nodesInSession.filter(
          (node: any) => locationIds.includes(node.ap_location_id) && node.state !== 'Checked'
        );

        if (nodesToMarkChecked.length > 0) {
          await Promise.all(
            nodesToMarkChecked.map((node) =>
              pb.collection('map_nodes').update(node.id, { state: 'Checked' })
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
        });

        const nodesToUnlockMock = hiddenNodes.slice(0, locationIds.length);

        if (nodesToUnlockMock.length > 0) {
          await Promise.all(
            nodesToUnlockMock.map((node) =>
              pb.collection('map_nodes').update(node.id, { state: 'Available' })
            )
          );
          nodesToUnlockMock.forEach((node) =>
            console.log(`[AP Mock] Unlocked node ${node.id} to Available`)
          );
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

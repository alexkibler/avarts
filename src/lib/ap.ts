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

let _msgId = 0;
let _hooksRegistered = false;
let _pendingType: ChatMessageType = 'server';

// Test mode variables
let _testMode = false;
let _testSessionId = '';

/**
 * Register message event hooks on the singleton apClient once.
 * Specific events fire before the generic "message" event (MessageManager emits them first),
 * so we set _pendingType in the specific handler and consume it in the generic one.
 */
function setupMessageHooks() {
  if (_hooksRegistered) return;
  _hooksRegistered = true;

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
}

export interface ApConnectionOptions {
  url: string;      // e.g. "archipelago.gg:64962"
  game: string;
  name: string;
  password?: string;
  sessionId: string; // PocketBase game_session id
}

export async function connectToAp(options: ApConnectionOptions) {
  setupMessageHooks();

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
    console.log(`[AP] Connecting to: ${cleanUrl}`);

    await apClient.login(
      cleanUrl,
      options.name,
      options.game,
      connectionOptions
    );

    console.log('[AP] Connected successfully!');

    await processReceivedItems(options.sessionId, apClient.items.received);
    await syncCheckedLocations(options.sessionId, apClient.room.checkedLocations);

    apClient.items.on('itemsReceived', async () => {
      await processReceivedItems(options.sessionId, apClient.items.received);
    });

    apClient.room.on('locationsChecked', async (newlyChecked: number[]) => {
      await syncCheckedLocations(options.sessionId, newlyChecked);
    });

    return true;
  } catch (error: any) {
    console.error('[AP] Failed to connect:', error?.message ?? error);
    return false;
  }
}

/**
 * Unlock map nodes sequentially based on how many Node Unlock items have been received.
 * Flat logic: total received item count determines how many nodes become Available.
 */
async function processReceivedItems(sessionId: string, items: any[]) {
  // Items in our range: START_ID 800001 – 802000 (MAX_CHECKS)
  const unlockItemsCount = items.filter((i: any) => i.id > 800000 && i.id <= 802000).length;

  // Location Swap items (START_ID + MAX_CHECKS + 3 = 802003)
  const totalSwapsFound = items.filter((i: any) => i.id === 802003).length;

  const session = await pb.collection('game_sessions').getOne(sessionId);
  const usedSwaps = session.location_swaps_used || 0;

  locationSwaps.set(Math.max(0, totalSwapsFound - usedSwaps));

  if (unlockItemsCount === 0) return;

  const nodes = await pb.collection('map_nodes').getFullList({
    filter: `session = "${sessionId}"`,
    sort: '+ap_location_id',
  });

  let unlockedCount = nodes.filter(
    (n: any) => n.state === 'Available' || n.state === 'Checked'
  ).length;

  const nodesToUnlock = [];
  for (const node of nodes) {
    if (unlockedCount >= unlockItemsCount) break;
    if (node.state === 'Hidden') {
      nodesToUnlock.push(node.id);
      unlockedCount++;
    }
  }

  if (nodesToUnlock.length > 0) {
    await Promise.all(
      nodesToUnlock.map((id) => pb.collection('map_nodes').update(id, { state: 'Available' }))
    );
  }
}

/**
 * Reconcile AP's checked locations with local node states.
 * Any node whose ap_location_id appears in the AP-checked list should be Checked in PocketBase.
 */
async function syncCheckedLocations(sessionId: string, checkedLocationIds: number[]) {
  if (!checkedLocationIds.length) return;

  const nodes = await pb.collection('map_nodes').getFullList({
    filter: `session = "${sessionId}"`,
  });

  const toMark = nodes.filter(
    (n: any) => checkedLocationIds.includes(n.ap_location_id) && n.state !== 'Checked'
  );

  if (toMark.length > 0) {
    await Promise.all(
      toMark.map((n: any) => pb.collection('map_nodes').update(n.id, { state: 'Checked' }))
    );
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

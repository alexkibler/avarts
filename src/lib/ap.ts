import { Client } from '@airbreather/archipelago.js';
import { pb } from '$lib/pb';
import { writable } from 'svelte/store';

export const apClient = new Client();

export type ChatMessageType = 'chat' | 'item' | 'system' | 'server';
export interface ChatMessage {
  id: number;
  text: string;
  type: ChatMessageType;
}

export const chatMessages = writable<ChatMessage[]>([]);

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
  if (cleanUrl === 'test' || isTestForce) {
      console.log('[AP] Test mode bypass engaged.');
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

    apClient.items.on('itemsReceived', async () => {
      await processReceivedItems(options.sessionId, apClient.items.received);
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
  // Items in our range: START_ID 800001 – 801000
  const unlockItemsCount = items.filter((i: any) => i.id > 800000 && i.id <= 801000).length;

  if (unlockItemsCount === 0) return;

  const nodes = await pb.collection('map_nodes').getFullList({
    filter: `session = "${sessionId}"`,
    sort: '+ap_location_id',
  });

  let unlockedCount = nodes.filter(
    (n: any) => n.state === 'Available' || n.state === 'Checked'
  ).length;

  for (const node of nodes) {
    if (unlockedCount >= unlockItemsCount) break;
    if (node.state === 'Hidden') {
      await pb.collection('map_nodes').update(node.id, { state: 'Available' });
      unlockedCount++;
    }
  }
}

export function sendLocationChecks(locationIds: number[]) {
  if (_testMode) {
    console.log(`[AP] Test mode: MOCKING ${locationIds.length} location checks.`);
    setTimeout(async () => {
      try {
        // Step 1: Mark each checked location as Checked (idempotent — validation.ts may have
        // already done this, but we ensure consistency if sendLocationChecks is called directly).
        for (const apLocId of locationIds) {
          const matched = await pb.collection('map_nodes').getFullList({
            filter: `session = "${_testSessionId}" && ap_location_id = ${apLocId}`,
          });
          for (const node of matched) {
            if (node.state !== 'Checked') {
              await pb.collection('map_nodes').update(node.id, { state: 'Checked' });
              console.log(`[AP Mock] Marked node ${node.id} (loc ${apLocId}) as Checked`);
            }
          }
        }

        // Step 2: Simulate receiving one unlock item per checked location.
        // Fetch hidden nodes fresh each iteration so we never re-unlock the same one.
        for (let i = 0; i < locationIds.length; i++) {
          const hiddenNodes = await pb.collection('map_nodes').getFullList({
            filter: `session = "${_testSessionId}" && state = "Hidden"`,
            sort: '+ap_location_id',
          });
          if (hiddenNodes.length > 0) {
            await pb.collection('map_nodes').update(hiddenNodes[0].id, { state: 'Available' });
            console.log(`[AP Mock] Unlocked node ${hiddenNodes[0].id} to Available`);
          }
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

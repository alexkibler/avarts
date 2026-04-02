import { Client } from '@airbreather/archipelago.js';
import { pb } from '$lib/pb';

export const apClient = new Client();

export interface ApConnectionOptions {
  url: string;      // e.g. "archipelago.gg:64962"
  game: string;
  name: string;
  password?: string;
  sessionId: string; // PocketBase game_session id
}

export async function connectToAp(options: ApConnectionOptions) {
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

    apClient.messages.on('message', (text: string) => {
      console.log('[AP]', text);
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
  if (apClient.authenticated) {
    apClient.check(...locationIds);
  } else {
    console.error('Cannot send checks — client is not authenticated.');
  }
}

import { Client, itemsHandlingFlags } from 'archipelago.js';
import { pb } from '$lib/pb';

export const apClient = new Client();

export interface ApConnectionOptions {
  url: string;      // e.g. "archipelago.gg:38281"
  game: string;
  name: string;
  password?: string;
  sessionId: string; // PocketBase game_session id
}

export async function connectToAp(options: ApConnectionOptions) {
  let urlsToTry = [options.url];

  if (typeof window !== 'undefined') {
    // We are running in the browser, so we need to use the local proxy to bypass mixed content rules
    // The Express server (running on the same origin) will proxy the connection for us
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Remove protocol from target URL if it exists
    const targetUrl = options.url.replace(/^wss?:\/\//i, '');
    const proxyUrl = `${protocol}//${window.location.host}/ap-proxy?target=${encodeURIComponent(targetUrl)}`;
    urlsToTry = [proxyUrl];
  } else {
    // If the user didn't specify a protocol, archipelago.js's internal fallback is buggy.
    // It tries wss://, which can hang forever if the server returns 101 but doesn't speak TLS (e.g. port 38281).
    // We'll explicitly try wss:// first, then ws://, but with our own 5 second timeout to bypass the hang.
    if (!/^wss?:\/\//i.test(options.url)) {
      urlsToTry = [`wss://${options.url}`, `ws://${options.url}`];
    }
  }

  for (const url of urlsToTry) {
    try {
      // Disconnect any hanging attempts before trying the new one
      apClient.socket.disconnect();

      const loginPromise = apClient.login(
        url,
        options.name,
        options.game,
        {
          password: options.password,
          items: itemsHandlingFlags.all,
        }
      );

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timed out')), 5000);
      });

      // Race the login attempt against a 5-second timeout
      await Promise.race([loginPromise, timeoutPromise]);

      console.log(`Successfully connected to Archipelago via ${url}!`);
      options.url = url; // Update the options so the UI reflects the successful URL

      // Process all items already queued on connect
      await processReceivedItems(options.sessionId, apClient.items.received);

      // Listen for new items during the session
      apClient.items.on('itemsReceived', async () => {
        await processReceivedItems(options.sessionId, apClient.items.received);
      });

      // Mirror AP chat/server messages to console
      apClient.messages.on('message', ([text]: [string]) => {
        console.log('[AP]', text);
      });

      return true;
    } catch (error) {
      console.error(`Failed to connect via ${url}:`, error);
      // Ensure we clean up the hung socket so the next URL can try cleanly
      apClient.socket.disconnect();
    }
  }

  console.error('Error connecting to Archipelago: All URL attempts failed.');
  return false;
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

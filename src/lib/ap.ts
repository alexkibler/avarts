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
  let urlsToTry: Array<string | URL> = [options.url];

  if (typeof window !== 'undefined') {
    // Strategy: try direct connection first, then fall back to proxy.
    //
    // Direct: pass the raw user URL — archipelago.js tries wss:// first, then ws://.
    // wss:// hosted rooms (e.g. archipelago.gg) work directly from the browser (no
    // mixed-content issue). Plain ws:// servers will fail (blocked by the browser from
    // HTTPS), so we fall through to the proxy.
    //
    // Proxy: needed for plain ws:// servers (mixed-content) and for servers that are
    // reachable from our backend but not directly from the user's browser.
    //
    // PROXY PORT BUG: archipelago.js v2 does `url.port = url.port || "38281"`. For a
    // wss:// URL, port 443 is the default and the JS URL API normalizes it to "", so the
    // || fires and clobbers the port to 38281.
    //
    // Fix: use a URL subclass with the port getter/setter overridden. Unlike a JS Proxy,
    // a subclass IS a real URL (instanceof URL === true), so the native browser WebSocket
    // constructor accepts it. Our JS getter returns "443" (truthy), preventing the ||
    // fallback; our JS setter is a no-op, keeping the underlying href clean (port 443
    // implicit). When the browser calls toString()/href to open the socket, it gets the
    // correct wss://hostname/ap-proxy?... URL.
    class ProxyUrl extends URL {
      override get port(): string { return '443'; }
      override set port(_v: string) { /* prevent archipelago.js from clobbering */ }
    }

    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const proxyHref = `${wsProto}//${window.location.host}/ap-proxy?target=${encodeURIComponent(options.url)}`;
    const proxyUrl = new ProxyUrl(proxyHref);

    console.log('[AP] Browser mode — direct URL:', options.url, '| proxy fallback:', proxyHref);
    urlsToTry = [options.url, proxyUrl];
  } else {
    // If the user didn't specify a protocol, archipelago.js's internal fallback is buggy.
    // It tries wss://, which can hang forever if the server returns 101 but doesn't speak TLS (e.g. port 38281).
    // We'll explicitly try wss:// first, then ws://, but with our own 5 second timeout to bypass the hang.
    if (!/^wss?:\/\//i.test(options.url)) {
      urlsToTry = [`wss://${options.url}`, `ws://${options.url}`];
    }
  }

  for (const url of urlsToTry) {
    console.log(`[AP] Attempting connection to: ${url}`);
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
        setTimeout(() => reject(new Error('Connection timed out after 10s')), 10000);
      });

      // Race the login attempt against a timeout
      await Promise.race([loginPromise, timeoutPromise]);

      console.log(`[AP] Successfully connected via ${url}`);
      // Keep the human-readable target URL in options, not the internal proxy href
      if (typeof url === 'string') options.url = url;

      // Process all items already queued on connect
      await processReceivedItems(options.sessionId, apClient.items.received);

      // Listen for new items during the session
      apClient.items.on('itemsReceived', async () => {
        await processReceivedItems(options.sessionId, apClient.items.received);
      });

      // Mirror AP chat/server messages to console
      apClient.messages.on('message', (text: string) => {
        console.log('[AP]', text);
      });

      return true;
    } catch (error: any) {
      console.error(`[AP] Failed to connect via ${url}:`, error?.message ?? error);
      // Ensure we clean up the hung socket so the next URL can try cleanly
      apClient.socket.disconnect();
    }
  }

  console.error('[AP] All connection attempts failed. URLs tried:', urlsToTry);
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

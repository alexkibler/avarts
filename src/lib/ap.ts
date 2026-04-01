import { Client, ITEMS_HANDLING_FLAGS, SERVER_PACKET_TYPE, type JSONMessagePart } from 'archipelago.js';
import { pb } from '$lib/pb';

export const apClient = new Client();

export interface ApConnectionOptions {
  url: string;
  game: string;
  name: string;
  password?: string;
  sessionId: string; // The PocketBase game_session id
}

export async function connectToAp(options: ApConnectionOptions) {
  try {
    const res = await apClient.connect({
      hostname: options.url.split(':')[0],
      port: parseInt(options.url.split(':')[1] || '38281'),
      game: options.game,
      name: options.name,
      password: options.password,
      items_handling: ITEMS_HANDLING_FLAGS.REMOTE_ALL,
    });

    if (res.connected) {
      console.log('Successfully connected to Archipelago!');

      // Process initially received items to unlock nodes
      await processReceivedItems(options.sessionId, apClient.items.received);

      // Listen for new items dynamically
      apClient.addListener(SERVER_PACKET_TYPE.RECEIVED_ITEMS, async (packet) => {
        await processReceivedItems(options.sessionId, packet.items);
      });

      apClient.addListener(SERVER_PACKET_TYPE.PRINT_JSON, (packet) => {
          if (packet.data) {
              const msg = packet.data.map((part: JSONMessagePart) => part.text).join("");
              console.log(msg);
          }
      });
      return true;
    } else {
      console.error('Failed to connect to Archipelago:', res.errors);
      return false;
    }
  } catch (error) {
    console.error('Error connecting to Archipelago:', error);
    return false;
  }
}

/**
 * When we receive items, they represent "Node Unlock X".
 * We update the state of the corresponding nodes to 'Available' in PocketBase.
 */
async function processReceivedItems(sessionId: string, items: any[]) {
  // Items received is an array of NetworkItem objects
  // Each item has an 'item' (ID) and 'location' (ID)

  // Since our items are "Node Unlock 1", "Node Unlock 2", etc.
  // We can just map the item IDs to indices and unlock those specific nodes.
  // Alternatively, if ANY Node Unlock unlocks the *next* sequential node,
  // we count the number of received node unlocks and make sure that many nodes are available.

  // Let's go with the flat logic: "Any unlocked node is physically routable."
  // Which means if we have 5 "Node Unlock" items, the first 5 nodes become 'Available'.

  // Filter items to ensure they belong to our game's ID range (e.g., START_ID = 800000)
  const unlockItemsCount = items.filter(i => i.item > 800000).length;

  if (unlockItemsCount === 0) return;

  // Fetch all nodes for this session, ordered sequentially
  const nodes = await pb.collection('map_nodes').getFullList({
    filter: \`session = "\${sessionId}"\`,
    sort: '+ap_location_id', // Ensure predictable order matching 1 to check_count
  });

  // Determine how many are currently available/checked vs how many should be
  let unlockedCount = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.state === 'Checked' || node.state === 'Available') {
      unlockedCount++;
    } else if (node.state === 'Hidden' && unlockedCount < unlockItemsCount) {
      // Unlock this node
      await pb.collection('map_nodes').update(node.id, {
        state: 'Available'
      });
      unlockedCount++;
    }
  }
}

export function sendLocationChecks(locationIds: number[]) {
  if (apClient.status === 'Connected') {
    apClient.locations.check(...locationIds);
  } else {
    console.error('Cannot send checks, client is not connected.');
  }
}

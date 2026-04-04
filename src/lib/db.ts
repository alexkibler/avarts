import { pb } from './pb';

/**
 * Queries for an existing game_session using RoomInfo composite key.
 *
 * Used to check if a player has already set up this AP session in bikeapelago,
 * avoiding duplicate setup when reconnecting to the same multiworld.
 *
 * Composite key:
 * - ap_seed_name (from RoomInfo.seedName)
 * - ap_server_url (from AP connection URL)
 * - ap_slot_name (from AP slot name)
 *
 * @param seedName - From apClient.room.seedName (immutable AP identifier)
 * @param serverUrl - The AP server URL user connected to
 * @param slotName - The player slot name on that server
 * @returns Game session record if found, null if new session
 */
export async function getSessionByRoomInfo(
	seedName: string,
	serverUrl: string,
	slotName: string
): Promise<any | null> {
	if (!seedName || !serverUrl || !slotName) {
		return null;
	}

	try {
		// Build composite filter for the three fields
		const filter = `ap_seed_name = "${seedName}" && ap_server_url = "${serverUrl}" && ap_slot_name = "${slotName}"`;

		const results = await pb.collection('game_sessions').getFullList({
			filter,
			limit: 1,
			requestKey: null
		});

		return results.length > 0 ? results[0] : null;
	} catch (error) {
		console.error('[DB] Error querying session by RoomInfo:', error);
		return null;
	}
}

/**
 * Creates a new game_session record with AP connection details.
 *
 * Called when user has validated AP connection and is ready to set up the map.
 * At this point, we know the session is new (doesn't exist in DB).
 *
 * @param userId - Logged-in user ID from authentication
 * @param seedName - From apClient.room.seedName
 * @param serverUrl - The AP server URL
 * @param slotName - The player slot name
 * @returns Created game_sessions record with id field
 */
export async function createGameSessionFromAp(
	userId: string,
	seedName: string,
	serverUrl: string,
	slotName: string
): Promise<any> {
	return pb.collection('game_sessions').create(
		{
			user: userId,
			ap_seed_name: seedName,
			ap_server_url: serverUrl,
			ap_slot_name: slotName,
			status: 'SetupInProgress'
		},
		{ requestKey: null }
	);
}

/**
 * Updates game_session with map details after node setup is complete.
 *
 * Called after user has chosen center point and nodes have been created.
 *
 * @param sessionId - Game session record ID
 * @param centerLat - Center latitude of search area
 * @param centerLon - Center longitude of search area
 * @param radius - Search radius in meters
 * @returns Updated record
 */
export async function updateSessionWithMapDetails(
	sessionId: string,
	centerLat: number,
	centerLon: number,
	radius: number
): Promise<any> {
	return pb.collection('game_sessions').update(
		sessionId,
		{
			center_lat: centerLat,
			center_lon: centerLon,
			radius: radius,
			status: 'Active'
		},
		{ requestKey: null }
	);
}

/**
 * Gets a game session by ID (for loading existing game).
 *
 * @param sessionId - Game session record ID
 * @returns Game session record or null if not found
 */
export async function getSessionById(sessionId: string): Promise<any | null> {
	try {
		return await pb.collection('game_sessions').getOne(sessionId, { requestKey: null });
	} catch (error) {
		console.error('[DB] Error fetching session:', error);
		return null;
	}
}

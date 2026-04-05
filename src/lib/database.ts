import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';
import { MockPocketBase } from './mock';

let url: string;
if (env.PUBLIC_DB_URL) {
	url = env.PUBLIC_DB_URL;
} else {
	url = 'http://127.0.0.1:8090';
}

const isMockMode =
	env.PUBLIC_MOCK_MODE === 'true' ||
	(typeof window !== 'undefined' && (window as any).PLAYWRIGHT_TEST);

export const pb = isMockMode
	? (new MockPocketBase() as unknown as PocketBase)
	: new PocketBase(url);

if (browser && isMockMode) {
	(window as any).pb = pb;
}

pb.autoCancellation(false);

if (browser) {
	pb.authStore.loadFromCookie(document.cookie);
}

/**
 * Queries for an existing game_session using RoomInfo composite key.
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
 */
export async function getSessionById(sessionId: string): Promise<any | null> {
	try {
		return await pb.collection('game_sessions').getOne(sessionId, { requestKey: null });
	} catch (error) {
		console.error('[DB] Error fetching session:', error);
		return null;
	}
}

export async function getLink(collection: string, id: string) {
	const dataLink = await pb.collection(collection).getOne(id);
	const dataName = dataLink.dataset;
	return await fetch(pb.files.getUrl(dataLink, dataName));
}

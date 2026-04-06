import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Client, itemsHandlingFlags } from '@airbreather/archipelago.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { serverUrl, slotName, password } = body;

		if (!serverUrl || !slotName) {
			throw error(400, 'Server URL and Slot Name are required');
		}

		// Add wss:// if no protocol provided and not localhost
		let url = serverUrl;
		if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
			url = url.includes('localhost') || url.includes('127.0.0.1') ? `ws://${url}` : `wss://${url}`;
		}

		const client = new Client();
		let roomInfo = null;

		try {
			// In archipelago.js v2, login performs both connection and authentication
			// We try "Bikeapelago" first if possible, but the game name is required for login validation
			// Since we don't have the game name yet, we first connect to get room info, then login.
			roomInfo = await client.socket.connect(url);

			if (roomInfo) {
				// Determine which game to use for validation login
				// Default to Bikeapelago if it's in the room, otherwise use Archipelago or the first game
				const game = roomInfo.games.includes('Bikeapelago')
					? 'Bikeapelago'
					: roomInfo.games.includes('Archipelago')
						? 'Archipelago'
						: roomInfo.games[0];

				// Attempt login to validate slot/password
				await client.login(url, slotName, game, {
					password
				});
			}
		} catch (err: any) {
			console.error('AP connect/login error:', err);
			// client.login throws informative errors for invalid slots/passwords
			let message = err.message || 'Failed to connect or validate slot with AP server';

			// Clean up raw Archipelago error strings like "Connection was refused by the server. Reason(s): [InvalidSlot]"
			if (message.includes('Reason(s): [')) {
				const match = message.match(/\[(.*?)\]/);
				if (match && match[1]) {
					const reason = match[1];
					// Map common reasons to friendly messages
					const reasonMap: Record<string, string> = {
						InvalidSlot: 'Invalid slot name',
						InvalidPassword: 'Invalid password',
						IncompatibleVersion: 'Incompatible Archipelago version',
						InvalidGame: 'Invalid game name for this slot'
					};
					message = reasonMap[reason] || reason.replace(/([A-Z])/g, ' $1').trim();
				}
			}

			return json({ message }, { status: 400 });
		} finally {
			// Always disconnect after validation to avoid leaking connections
			client.socket.disconnect();
		}

		if (!roomInfo) {
			return json({ message: 'Connected but no room info received' }, { status: 400 });
		}

		return json({
			roomInfo
		});
	} catch (e: any) {
		console.error('[AP Connect Error]', e);
		return json({ message: e.message || 'Internal server error' }, { status: 500 });
	}
};

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
			// In archipelago.js v2, socket.connect returns the RoomInfoPacket directly
			roomInfo = await client.socket.connect(url);
		} catch (err: any) {
			console.error('AP connect error:', err);
			return json({ message: err.message || 'Failed to connect to AP server' }, { status: 400 });
		}

		client.socket.disconnect();

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

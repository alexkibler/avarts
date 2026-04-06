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

		const connectInfo = {
			hostname: url.split('://')[1].split(':')[0],
			port: parseInt(url.split(':')[url.split(':').length - 1] || '38281'),
			name: slotName,
			game: '', // Leave empty to connect to any game
			password: password || '',
			items_handling: itemsHandlingFlags.all,
			tags: ['AP'],
			version: {
				major: 0,
				minor: 4,
				build: 4,
				class: 'Version'
			}
		};

		// We only want roomInfo to extract seed_name
		let roomInfo = null;
		client.addListener('roomInfo', (packet) => {
			roomInfo = packet;
		});

		try {
			await client.connect(connectInfo);
		} catch (err: any) {
			console.error('AP connect error:', err);
			return json({ message: err.message || 'Failed to connect to AP server' }, { status: 400 });
		}

		client.disconnect();

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

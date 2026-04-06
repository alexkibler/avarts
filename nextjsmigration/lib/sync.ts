import { pb } from './database';
import { useMapStore } from './store';

export async function fetchNodes(sessionId: string) {
	const nodes = await pb.collection('map_nodes').getFullList({
		filter: `session = "${sessionId}"`,
		sort: '+ap_location_id',
		requestKey: null
	});
	useMapStore.getState().setMapNodes(nodes);
	return nodes;
}

export async function subscribeToNodes(sessionId: string) {
	try {
		return await pb.collection('map_nodes').subscribe('*', (e: any) => {
			if (e.record.session !== sessionId) return;
			if (e.action === 'update') {
        useMapStore.getState().updateMapNode(e.record);
			} else if (e.action === 'create') {
        useMapStore.getState().addMapNode(e.record);
			} else if (e.action === 'delete') {
        useMapStore.getState().removeMapNode(e.record.id);
			}
		});
	} catch (err) {
		console.warn('[Realtime] Failed to subscribe to map_nodes:', err);
		return null;
	}
}

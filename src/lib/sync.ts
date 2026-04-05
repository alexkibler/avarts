import { pb } from './database';
import { mapNodes } from './mapState';

export async function fetchNodes(sessionId: string) {
	const nodes = await pb.collection('map_nodes').getFullList({
		filter: `session = "${sessionId}"`,
		sort: '+ap_location_id',
		requestKey: null
	});
	mapNodes.set(nodes);
	return nodes;
}

export async function subscribeToNodes(sessionId: string) {
	try {
		return await pb.collection('map_nodes').subscribe('*', (e: any) => {
			if (e.record.session !== sessionId) return;
			if (e.action === 'update') {
				mapNodes.update(($nodes) => {
					return $nodes.map((n) => (n.id === e.record.id ? e.record : n));
				});
			} else if (e.action === 'create') {
				mapNodes.update(($nodes) => [...$nodes, e.record]);
			} else if (e.action === 'delete') {
				mapNodes.update(($nodes) => $nodes.filter((n) => n.id !== e.record.id));
			}
		});
	} catch (err) {
		console.warn('[Realtime] Failed to subscribe to map_nodes:', err);
		return null;
	}
}

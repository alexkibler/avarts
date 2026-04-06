import type PocketBase from 'pocketbase';
import { GeneratorService, type BaseGenerationRequest } from './GeneratorService';

export class ArchipelagoGenerator extends GeneratorService {
	constructor(pb: PocketBase) {
		super(pb);
	}

	async createSession(request: BaseGenerationRequest): Promise<any> {
		if (!request.serverUrl || !request.slotName) {
			throw new Error('Archipelago mode requires serverUrl and slotName');
		}

		return await this.pb.collection('game_sessions').create(
			{
				user: request.userId,
				ap_seed_name: request.seedName,
				ap_server_url: request.serverUrl,
				ap_slot_name: request.slotName,
				center_lat: request.centerLat,
				center_lon: request.centerLon,
				radius: request.radius,
				status: 'SetupInProgress'
			},
			{ requestKey: null }
		);
	}

	async getLocations(
		request: BaseGenerationRequest,
		nodes: any[]
	): Promise<{ id: number; name: string }[]> {
		// Fetch AP items from PocketBase mapping table
		// This simulates the behavior where Archipelago has specific location IDs
		return nodes.map((node, i) => ({
			id: 800000 + (i + 1), // Standard start for Archipelago locations if not fully mapped, just mimicking previous behavior
			name: `OSM Node ${node.id}`
		}));
	}
}

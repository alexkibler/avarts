import type PocketBase from 'pocketbase';
import { GeneratorService, type BaseGenerationRequest } from './GeneratorService';

export class SinglePlayerGenerator extends GeneratorService {
	constructor(pb: PocketBase) {
		super(pb);
	}

	async createSession(request: BaseGenerationRequest): Promise<any> {
		return await this.pb.collection('game_sessions').create(
			{
				user: request.userId,
				ap_seed_name: request.seedName || 'Single Player',
				center_lat: request.centerLat,
				center_lon: request.centerLon,
				radius: request.radius,
				status: 'Active' // SP immediately goes active
			},
			{ requestKey: null }
		);
	}

	async getLocations(
		request: BaseGenerationRequest,
		nodes: any[]
	): Promise<{ id: number; name: string }[]> {
		return nodes.map((node, i) => ({
			id: GeneratorService.BASE_LOCATION_ID + (i + 1),
			name: `OSM Node ${node.id}`
		}));
	}
}

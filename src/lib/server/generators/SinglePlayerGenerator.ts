import type PocketBase from 'pocketbase';
import { GeneratorService, type BaseGenerationRequest } from './GeneratorService';

export class SinglePlayerGenerator extends GeneratorService {
	constructor(pb: PocketBase) {
		super(pb);
	}

	async createSession(request: BaseGenerationRequest): Promise<any> {
		const data = {
			user: request.userId,
			ap_seed_name: request.seedName || 'Single Player',
			center_lat: request.centerLat,
			center_lon: request.centerLon,
			radius: request.radius,
			status: 'Active' // SP immediately goes active
		};

		if (request.sessionId) {
			console.log(`[SinglePlayerGenerator] Updating existing session: ${request.sessionId}`);
			return await this.pb
				.collection('game_sessions')
				.update(request.sessionId, data, { requestKey: null });
		}

		return await this.pb.collection('game_sessions').create(data, { requestKey: null });
	}

	async getLocations(
		request: BaseGenerationRequest,
		nodes: any[]
	): Promise<{ id: number; name: string }[]> {
		return nodes.map((node, i) => ({
			id: 800000 + (i + 1),
			name: `OSM Node ${node.id}`
		}));
	}
}

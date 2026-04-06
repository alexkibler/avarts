import type PocketBase from 'pocketbase';
import { fetchCyclingIntersections, shuffleArray } from '../../osm';

export interface BaseGenerationRequest {
	centerLat: number;
	centerLon: number;
	radius: number;
	checkCount: number;
	seedName: string;
	userId: string;
	authToken: string;
	appUrl: string;
	mode: 'singleplayer' | 'archipelago';
	// AP specific fields
	serverUrl?: string;
	slotName?: string;
	sessionId?: string;
}

export abstract class GeneratorService {
	protected pb: PocketBase;

	constructor(pb: PocketBase) {
		this.pb = pb;
	}

	abstract createSession(request: BaseGenerationRequest): Promise<any>;

	abstract getLocations(
		request: BaseGenerationRequest,
		intersections: any[]
	): Promise<{ id: number; name: string }[]>;

	async fetchNodes(request: BaseGenerationRequest) {
		const intersections = await fetchCyclingIntersections(
			request.centerLat,
			request.centerLon,
			request.radius
		);

		if (intersections.length < request.checkCount) {
			throw new Error(
				`Found only ${intersections.length} intersections, need ${request.checkCount}. Increase radius or decrease check count.`
			);
		}

		return shuffleArray(intersections).slice(0, request.checkCount);
	}
}

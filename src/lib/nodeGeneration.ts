import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';
import { updateJob, completeJob, failJob, startJob } from './jobTracker';
import { getGeneratorService } from './server/generators';
import type { BaseGenerationRequest } from './server/generators/GeneratorService';

export type GenerateNodesRequest = BaseGenerationRequest;

/**
 * Main async node generation function.
 * This runs on the backend and can survive frontend disconnects.
 *
 * Process:
 * 1. Validate parameters
 * 2. Start job (mark as processing)
 * 3. Fetch OSM intersections
 * 4. Create game session
 * 5. Create map_nodes with reverse geocoding
 * 6. Update progress throughout
 * 7. Mark complete
 */
export async function generateNodes(jobId: string, request: GenerateNodesRequest): Promise<void> {
	// Create a per-job authenticated PocketBase client.
	// nodeGeneration runs server-side where the module-level pb singleton has no auth,
	// so we build a fresh client and load the caller's token directly.
	const pbUrl = env.PUBLIC_DB_URL || 'http://127.0.0.1:8090';
	const pb = new PocketBase(pbUrl);
	pb.authStore.save(request.authToken);

	try {
		// Mark job as started
		await startJob(jobId);

		const generator = getGeneratorService(request.mode, pb);

		// Step 1: Fetch and select nodes
		await updateJob(jobId, {
			progress: { completed: 0, total: 0 }
		});

		console.log(
			`[NodeGen] Fetching intersections around (${request.centerLat}, ${request.centerLon}), radius ${request.radius}m`
		);

		let selectedNodes: any[];
		try {
			selectedNodes = await generator.fetchNodes(request);
		} catch (error) {
			throw new Error(`Failed to fetch and select nodes: ${error}`);
		}

		await updateJob(jobId, {
			progress: { completed: 0, total: selectedNodes.length }
		});

		// Step 2: Create game session
		console.log(`[NodeGen] Creating game session for seed: ${request.seedName}`);

		const sessionRecord = await generator.createSession(request);

		console.log(`[NodeGen] Created session: ${sessionRecord.id}`);

		// Step 3: Get location mapping
		const mappedLocations = await generator.getLocations(request, selectedNodes);

		// Step 4: Create map nodes with reverse geocoding
		console.log(`[NodeGen] Creating ${selectedNodes.length} nodes`);

		const nodeCreationErrors: string[] = [];

		for (let i = 0; i < selectedNodes.length; i++) {
			const node = selectedNodes[i];
			const loc = mappedLocations[i];
			let nodeName = loc.name;

			// Attempt reverse geocoding with retries
			const maxRetries = 3;
			for (let retry = 0; retry < maxRetries; retry++) {
				try {
					const res = await fetch(
						`${request.appUrl}/api/geocode?q=${node.lat},${node.lon}&limit=1&locale=en`,
						{ signal: AbortSignal.timeout(5000) } // 5s timeout per request
					);

					if (res.ok) {
						const data = await res.json();
						if (data.hits && data.hits.length > 0) {
							nodeName = data.hits[0].name;
							break; // Success, exit retry loop
						}
					}
				} catch (error) {
					if (retry === maxRetries - 1) {
						nodeCreationErrors.push(
							`Node ${node.id}: Geocoding failed after ${maxRetries} attempts`
						);
					}
					// Continue to retry
					if (retry < maxRetries - 1) {
						await new Promise((r) => setTimeout(r, 1000)); // Wait before retry
					}
				}
			}

			// Create map node
			try {
				await pb.collection('map_nodes').create(
					{
						session: sessionRecord.id,
						ap_location_id: loc.id,
						osm_node_id: node.id.toString(),
						name: nodeName,
						lat: node.lat,
						lon: node.lon,
						state: request.mode === 'singleplayer' && i < 3 ? 'Available' : 'Hidden'
					},
					{ requestKey: null }
				);
			} catch (error) {
				throw new Error(`Failed to create node ${i + 1}: ${error}`);
			}

			// Update progress
			await updateJob(jobId, {
				progress: { completed: i + 1, total: selectedNodes.length },
				sessionId: sessionRecord.id
			});

			// Small delay to avoid overwhelming server
			await new Promise((r) => setTimeout(r, 100));
		}

		// Step 5: Mark session as complete
		await pb.collection('game_sessions').update(
			sessionRecord.id,
			{
				status: 'Active'
			},
			{ requestKey: null }
		);

		// Mark job complete
		await completeJob(jobId, sessionRecord.id);

		if (nodeCreationErrors.length > 0) {
			console.warn(
				`[NodeGen] Job completed with warnings: ${nodeCreationErrors.length} geocoding failures`
			);
		} else {
			console.log(`[NodeGen] Job completed successfully: ${selectedNodes.length} nodes created`);
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[NodeGen] Job failed: ${errorMessage}`);
		await failJob(jobId, errorMessage);
	}
}

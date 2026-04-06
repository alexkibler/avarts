import { pb } from '$lib/database';
import type { IGameEngine } from '$lib/engine/IGameEngine';
import { SportsLib } from '@sports-alliance/sports-lib';
import FitParser from 'fit-file-parser';

export interface RideSummary {
	path: { lat: number; lon: number; alt?: number }[];
	stats: {
		distanceMeters: number;
		elevationGainMeters: number;
		durationSeconds: number;
		movingTimeSeconds: number;
		avgSpeedKph: number;
		maxSpeedKph: number;
		avgPower?: number;
		maxPower?: number;
		avgHR?: number;
		maxHR?: number;
		avgCadence?: number;
		maxCadence?: number;
		calories?: number;
		avgTemp?: number;
	};
	newlyCheckedNodes: {
		id: string;
		ap_location_id: number;
		lat: number;
		lon: number;
	}[];
}

// Haversine formula to calculate distance between two coordinates in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371e3; // Earth radius in meters
	const p1 = (lat1 * Math.PI) / 180;
	const p2 = (lat2 * Math.PI) / 180;
	const dp = ((lat2 - lat1) * Math.PI) / 180;
	const dl = ((lon2 - lon1) * Math.PI) / 180;

	const a =
		Math.sin(dp / 2) * Math.sin(dp / 2) +
		Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return R * c;
}

export async function analyzeFitFile(file: File, sessionId: string): Promise<RideSummary> {
	try {
		console.log('[AnalyzeFitFile] Starting analysis for file:', file.name);
		console.log('[AnalyzeFitFile] File size:', file.size, 'bytes');
		console.log('[AnalyzeFitFile] File type:', file.type);

		if (file.size === 0) {
			console.warn('[AnalyzeFitFile] File size is 0');
			throw new Error('The FIT file is empty. Please upload a valid ride file.');
		}

		console.log('[AnalyzeFitFile] Reading array buffer...');
		const arrayBuffer = await file.arrayBuffer();
		console.log('[AnalyzeFitFile] ArrayBuffer length:', arrayBuffer.byteLength, 'bytes');

		let event;
		try {
			event = await SportsLib.importFromFit(arrayBuffer);
			console.log('[AnalyzeFitFile] SportsLib.importFromFit success');
		} catch (importErr: any) {
			if (importErr.message === 'Empty fit file') {
				console.warn(
					'[AnalyzeFitFile] SportsLib reported empty file, attempting fallback recovery...'
				);
				const fitParser = new FitParser({
					force: true,
					speedUnit: 'm/s',
					lengthUnit: 'm',
					temperatureUnit: 'celsius',
					elapsedRecordField: false,
					mode: 'both'
				});

				const fitObject: any = await new Promise((resolve, reject) => {
					fitParser.parse(arrayBuffer, (error: any, data: any) => {
						if (error) reject(error);
						else resolve(data);
					});
				});

				console.log(
					'[AnalyzeFitFile] Fallback parse complete. Records:',
					fitObject.records?.length,
					'Sessions:',
					fitObject.sessions?.length
				);

				if (fitObject.records && fitObject.records.length > 0) {
					// Synthesize path from records
					const fallbackPath: { lat: number; lon: number; alt?: number }[] = [];
					fitObject.records.forEach((record: any) => {
						if (record.position_lat !== undefined && record.position_long !== undefined) {
							fallbackPath.push({
								lat: record.position_lat,
								lon: record.position_long,
								alt: record.altitude !== undefined ? record.altitude : undefined
							});
						}
					});

					if (fallbackPath.length > 0) {
						console.log(
							'[AnalyzeFitFile] Successfully synthesized path from',
							fallbackPath.length,
							'records'
						);
						// Calculate basic stats
						const firstRecord = fitObject.records[0];
						const lastRecord = fitObject.records[fitObject.records.length - 1];
						const durationMs = lastRecord.timestamp - firstRecord.timestamp;
						const distanceMeters = lastRecord.distance || 0;

						// Calculate elevation gain
						let elevationGain = 0;
						for (let i = 1; i < fitObject.records.length; i++) {
							const prevAlt = fitObject.records[i - 1].altitude;
							const currAlt = fitObject.records[i].altitude;
							if (prevAlt !== undefined && currAlt !== undefined && currAlt > prevAlt) {
								elevationGain += currAlt - prevAlt;
							}
						}

						const stats = {
							distanceMeters: distanceMeters,
							elevationGainMeters: elevationGain,
							durationSeconds: durationMs / 1000,
							movingTimeSeconds: durationMs / 1000,
							avgSpeedKph:
								distanceMeters > 0 && durationMs > 0
									? (distanceMeters / (durationMs / 1000)) * 3.6
									: 0,
							maxSpeedKph: 0
						};

						// Try to get distance more accurately if available
						if (stats.distanceMeters === 0) {
							// Simple haversine sum could go here if needed
						}

						// Fetch nodes and continue
						const availableNodes = await pb.collection('map_nodes').getFullList({
							filter: `session = "${sessionId}" && state = "Available"`,
							requestKey: null
						});

						const newlyCheckedNodes: RideSummary['newlyCheckedNodes'] = [];
						for (const node of availableNodes) {
							let minDistance = Infinity;
							const isWithinRadius = fallbackPath.some((point) => {
								const distance = getDistance(node.lat, node.lon, point.lat, point.lon);
								if (distance < minDistance) minDistance = distance;
								return distance <= 30;
							});

							if (isWithinRadius) {
								newlyCheckedNodes.push({
									id: node.id,
									ap_location_id: node.ap_location_id,
									lat: node.lat,
									lon: node.lon
								});
							}
						}

						return {
							path: fallbackPath,
							stats,
							newlyCheckedNodes
						};
					}
				}
			}
			throw new Error(`Failed to parse FIT file: ${importErr.message || importErr}`);
		}

		const activities = event.getActivities();
		console.log('[AnalyzeFitFile] Found activities:', activities.length);

		if (activities.length === 0) {
			console.warn('[AnalyzeFitFile] No activities found in FIT file');
			throw new Error('No activities found in FIT file');
		}

		const activity = activities[0];
		console.log('[AnalyzeFitFile] Analyzing activity 0');

		// Extract path and stats
		const path: { lat: number; lon: number; alt?: number }[] = [];

		let positions: any[] = [];
		if (activity.hasStreamData('Position')) {
			console.log('[AnalyzeFitFile] Found Position data stream');
			positions = activity.getStreamDataByTime('Position');
		} else if (activity.hasStreamData('Location')) {
			console.log('[AnalyzeFitFile] Found Location data stream');
			positions = activity.getStreamDataByTime('Location');
		} else {
			console.log('[AnalyzeFitFile] No Position or Location data streams found');
		}

		if (positions.length > 0) {
			console.log('[AnalyzeFitFile] Processing', positions.length, 'position points');
			const altitudes = activity.hasStreamData('Altitude')
				? activity.getStreamDataByTime('Altitude')
				: [];
			console.log('[AnalyzeFitFile] Found altitudes:', altitudes.length);

			positions.forEach((pos: any, index: number) => {
				if (pos.value) {
					const lat =
						typeof pos.value === 'object' ? pos.value.latitude || pos.value.lat : undefined;
					const lon =
						typeof pos.value === 'object' ? pos.value.longitude || pos.value.lon : undefined;
					if (lat !== undefined && lon !== undefined) {
						path.push({
							lat,
							lon,
							alt: altitudes[index]?.value || undefined
						});
					}
				}
			});
		} else if (activity.hasPositionData()) {
			console.log('[AnalyzeFitFile] activity.hasPositionData() is true');
			const lats = activity.getSquashedStreamData('Latitude');
			const lons = activity.getSquashedStreamData('Longitude');
			console.log('[AnalyzeFitFile] Squashed lats:', lats.length, 'lons:', lons.length);
			lats.forEach((lat, i) => {
				path.push({ lat, lon: lons[i] });
			});
		} else {
			console.log('[AnalyzeFitFile] No position data found in activity');
		}

		console.log('[AnalyzeFitFile] Final path length:', path.length);
		if (path.length === 0) {
			console.warn('[AnalyzeFitFile] No GPS data found in path');
			throw new Error('No GPS data found in FIT file.');
		}

		const getStatValue = (type: string) => {
			const stat = activity.getStat(type);
			return stat ? (stat.getValue() as number) : undefined;
		};

		const stats = {
			distanceMeters: getStatValue('Distance') || 0,
			elevationGainMeters: getStatValue('Ascent') || 0,
			durationSeconds: activity.getDuration().getValue() || 0,
			movingTimeSeconds: getStatValue('Moving Time') || activity.getDuration().getValue() || 0,
			avgSpeedKph: (getStatValue('Average Speed') || 0) * 3.6,
			maxSpeedKph: (getStatValue('Max Speed') || 0) * 3.6,
			avgPower: getStatValue('Average Power'),
			maxPower: getStatValue('Max Power'),
			avgHR: getStatValue('Average Heart Rate'),
			maxHR: getStatValue('Max Heart Rate'),
			avgCadence: getStatValue('Average Cadence'),
			maxCadence: getStatValue('Max Cadence'),
			calories: getStatValue('Calories'),
			avgTemp: getStatValue('Average Temperature')
		};

		// Fetch all available nodes for this session
		const availableNodes = await pb.collection('map_nodes').getFullList({
			filter: `session = "${sessionId}" && state = "Available"`,
			requestKey: null
		});

		const newlyCheckedNodes: RideSummary['newlyCheckedNodes'] = [];

		// For each available node, check if any point in the path is within 30 meters
		console.log(
			`[Analyze] Checking ${availableNodes.length} nodes against ${path.length} path points.`
		);
		for (const node of availableNodes) {
			let minDistance = Infinity;
			const isWithinRadius = path.some((point) => {
				const distance = getDistance(node.lat, node.lon, point.lat, point.lon);
				if (distance < minDistance) minDistance = distance;
				return distance <= 30; // 30 meters threshold
			});

			if (isWithinRadius) {
				console.log(`[Analyze] Node ${node.id} HIT (min dist: ${minDistance.toFixed(2)}m)`);
				newlyCheckedNodes.push({
					id: node.id,
					ap_location_id: node.ap_location_id,
					lat: node.lat,
					lon: node.lon
				});
			} else {
				// Only log every 10th miss to avoid flooding
				if (Math.random() > 0.9) {
					console.log(`[Analyze] Node ${node.id} MISS (min dist: ${minDistance.toFixed(2)}m)`);
				}
			}
		}

		return {
			path,
			stats,
			newlyCheckedNodes
		};
	} catch (err: any) {
		console.error('[AnalyzeFitFile Error]', err);
		throw err;
	}
}

export async function commitValidation(
	newlyCheckedNodes: RideSummary['newlyCheckedNodes'],
	gameEngine: IGameEngine
): Promise<string[]> {
	const messages: string[] = [];
	const nodeIds = newlyCheckedNodes.map((n) => n.id);
	const apLocationIdsToCheck = newlyCheckedNodes.map((n) => n.ap_location_id);

	if (nodeIds.length > 0) {
		// Update DB
		const updatePromises = nodeIds.map((id) =>
			pb.collection('map_nodes').update(id, { state: 'Checked' }, { requestKey: null })
		);
		await Promise.all(updatePromises);

		// Send AP check
		gameEngine.sendLocationChecks(apLocationIdsToCheck);

		newlyCheckedNodes.forEach((node) => {
			messages.push(`Unlocked Location ${node.ap_location_id} at [${node.lat}, ${node.lon}]!`);
		});
		messages.push(`Successfully validated ${nodeIds.length} location(s) and notified Archipelago.`);
	} else {
		messages.push('No available locations were reached in this ride.');
	}

	return messages;
}

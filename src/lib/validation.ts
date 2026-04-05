import { pb } from '$lib/database';
import type { IGameEngine } from '$lib/engine/IGameEngine';
import { SportsLib } from '@sports-alliance/sports-lib';

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
		const arrayBuffer = await file.arrayBuffer();
		const event = await SportsLib.importFromFit(arrayBuffer);
		const activities = event.getActivities();
		if (activities.length === 0) throw new Error('No activities found in FIT file');

		const activity = activities[0];

		// Extract path and stats
		const path: { lat: number; lon: number; alt?: number }[] = [];

		let positions: any[] = [];
		if (activity.hasStreamData('Position')) {
			positions = activity.getStreamDataByTime('Position');
		} else if (activity.hasStreamData('Location')) {
			positions = activity.getStreamDataByTime('Location');
		}

		if (positions.length > 0) {
			const altitudes = activity.hasStreamData('Altitude')
				? activity.getStreamDataByTime('Altitude')
				: [];
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
			const lats = activity.getSquashedStreamData('Latitude');
			const lons = activity.getSquashedStreamData('Longitude');
			lats.forEach((lat, i) => {
				path.push({ lat, lon: lons[i] });
			});
		}

		if (path.length === 0) {
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

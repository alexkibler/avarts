
import type { Coordinates, ElevationResponse, Route } from './types';

// Haversine formula to calculate distance between two coordinates in km
export function getDistance(
	coord1: { lat: number; lon: number },
	coord2: { lat: number; lon: number }
): number {
	const R = 6371; // Radius of the earth in km
	const dLat = (coord2.lat - coord1.lat) * (Math.PI / 180);
	const dLon = (coord2.lon - coord1.lon) * (Math.PI / 180);

	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(coord1.lat * (Math.PI / 180)) *
			Math.cos(coord2.lat * (Math.PI / 180)) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

export function getPermutations(arr: any[]): any[][] {
	if (arr.length <= 1) return [arr];
	const result: any[][] = [];

	for (let i = 0; i < arr.length; i++) {
		const current = arr[i];
		const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
		const remainingPerms = getPermutations(remaining);

		for (let j = 0; j < remainingPerms.length; j++) {
			result.push([current].concat(remainingPerms[j]));
		}
	}
	return result;
}

export function findOptimalRoute(startPoint: { lat: number; lon: number }, destinations: any[]) {
	const permutations = getPermutations(destinations);
	let shortestDistance = Infinity;
	let bestRoute: any[] = [];

	for (const route of permutations) {
		let currentDistance = 0;
		let currentLocation = startPoint;

		for (const stop of route) {
			currentDistance += getDistance(currentLocation, stop);
			currentLocation = stop;

			if (currentDistance >= shortestDistance) break;
		}

		if (currentDistance < shortestDistance) {
			shortestDistance = currentDistance;
			bestRoute = route;
		}
	}

	return {
		optimalOrder: [startPoint, ...bestRoute],
		totalDistanceKm: shortestDistance
	};
}

export async function getElevationData(coordinates: Coordinates) {
	try {
		const apiUrl = 'https://api.open-elevation.com/api/v1/lookup';
		const locations = coordinates.map((coord) => ({
			latitude: coord.lat,
			longitude: coord.lng
		}));

		if (process.env.NEXT_PUBLIC_MOCK_MODE === 'true') {
			return locations.map(() => 100); // Dummy elevation
		}

		const response = await fetch(apiUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ locations })
		});

		if (response.ok) {
			const data: ElevationResponse = await response.json();
			return data.results.map((result) => result.elevation);
		} else {
			throw new Error('Failed to fetch elevation data');
		}
	} catch (error) {
		console.error('Error in getElevationData:', error);
		throw error;
	}
}

export function generateGPX(
	routeData: Route,
	userName: string,
	userId: string,
	sessionName: string,
	apSlot: string
) {
	const combinedName = `${sessionName}_${apSlot}`;

	const gpx = `<?xml version='1.0' encoding='UTF-8'?>
<gpx version="1.1" creator="${userName}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${combinedName}</name>
    <author><name>${userName}</name><link href="${userId}" /></author>
    <copyright author="OpenStreetMap contributors"><license>https://www.openstreetmap.org/copyright</license></copyright>
  </metadata>
  <trk>
    <name>${combinedName}</name>
    <type>cycling</type>
    <trkseg>
      ${routeData.coordinates
				.map(
					(coord: any) =>
						`<trkpt lat="${coord.lat}" lon="${coord.lng}"><ele>${
							coord.meta?.elevation || 0
						}</ele></trkpt>`
				)
				.join('\n')}
    </trkseg>
  </trk>
</gpx>`;
	return gpx;
}

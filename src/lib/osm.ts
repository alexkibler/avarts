export interface OSMNode {
	id: number;
	lat: number;
	lon: number;
	tags?: Record<string, string>;
}

export interface OSMWay {
	id: number;
	nodes: number[];
	tags: Record<string, string>;
}

export interface OSMResponse {
	elements: Array<{
		type: 'node' | 'way';
		id: number;
		lat?: number;
		lon?: number;
		nodes?: number[];
		tags?: Record<string, string>;
	}>;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371000; // Earth radius in meters
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fetches cycling-friendly intersections within a given radius using the Overpass API.
 *
 * @param lat Center latitude
 * @param lon Center longitude
 * @param radius Radius in meters
 * @returns Array of OSM Nodes that are confirmed intersections
 */
import { env } from '$env/dynamic/public';

export async function fetchCyclingIntersections(
	lat: number,
	lon: number,
	radius: number
): Promise<OSMNode[]> {
	if (env.PUBLIC_MOCK_MODE === 'true') {
		// Return dummy nodes arranged around the center
		return Array.from({ length: 50 }, (_, i) => ({
			id: 999000 + i,
			lat: lat + (Math.random() - 0.5) * 0.01,
			lon: lon + (Math.random() - 0.5) * 0.01
		}));
	}

	// Prefer local Overpass instance, fall back to public
	const localOverpass = env.PUBLIC_OVERPASS_URL;
	const publicOverpass = 'https://overpass-api.de/api/interpreter';

	// The Overpass QL query:
	// 1. Finds ways matching the cycling whitelist within the bounding box.
	// 2. Returns those ways and their constituent nodes.
	const query = `
    [out:json][timeout:25];
    way["highway"~"^(residential|tertiary|unclassified|living_street|cycleway|track)$"]["bicycle"!="no"](around:${radius},${lat},${lon});
    (._;>;);
    out;
  `;

	// Try local Overpass first, then public with retries
	const overpassUrls = [
		...(localOverpass ? [localOverpass] : []),
		publicOverpass
	];

	let lastError: Error | null = null;

	for (const overpassUrl of overpassUrls) {
		try {
			const data = await fetchWithRetry(overpassUrl, query);
			return processOverpassResponse(data, lat, lon, radius);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			console.warn(`[OSM] Overpass API failed (${overpassUrl}):`, lastError.message);
			// Continue to next URL
		}
	}

	// All URLs exhausted
	throw lastError || new Error('Failed to fetch intersections from all Overpass sources');
}

/**
 * Fetch with exponential backoff retry logic
 */
async function fetchWithRetry(
	url: string,
	query: string,
	maxRetries: number = 3
): Promise<OSMResponse> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const response = await fetch(url, {
				method: 'POST',
				body: query,
				signal: AbortSignal.timeout(30000) // 30s timeout
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return await response.json();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Don't retry on auth errors
			if (lastError.message.includes('401') || lastError.message.includes('403')) {
				throw lastError;
			}

			// Calculate exponential backoff with jitter
			if (attempt < maxRetries - 1) {
				const baseDelay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
				const jitter = Math.random() * 0.1 * baseDelay; // ±10% jitter
				const delay = baseDelay + jitter;
				console.log(`[OSM] Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	throw lastError || new Error('Failed to fetch from Overpass API');
}

/**
 * Process Overpass API response and extract intersections
 */
function processOverpassResponse(
	data: OSMResponse,
	lat: number,
	lon: number,
	radius: number
): OSMNode[] {

	const nodes = new Map<number, OSMNode>();
	const ways: OSMWay[] = [];

	// Parse the response into nodes and ways
	for (const el of data.elements) {
		if (el.type === 'node') {
			nodes.set(el.id, { id: el.id, lat: el.lat!, lon: el.lon!, tags: el.tags });
		} else if (el.type === 'way') {
			ways.push({ id: el.id, nodes: el.nodes || [], tags: el.tags || {} });
		}
	}

	// Map to track how many *differently named* ways a node belongs to
	// Key: Node ID, Value: Set of Way Names (or IDs if no name, but we prefer names)
	const nodeWayNames = new Map<number, Set<string>>();

	for (const way of ways) {
		// If a way has no name, we use its ID as a fallback to at least distinguish different physical ways,
		// though "differently named ways" implies we want named roads. Let's strictly use names if possible,
		// but many cycleways/tracks might not have names. We'll use the way ID to guarantee they are distinct ways.
		const wayIdentifier = way.tags.name || `way-${way.id}`;

		for (const nodeId of way.nodes) {
			if (!nodeWayNames.has(nodeId)) {
				nodeWayNames.set(nodeId, new Set());
			}
			nodeWayNames.get(nodeId)!.add(wayIdentifier);
		}
	}

	const intersections: OSMNode[] = [];

	// Filter nodes that belong to at least two differently named/identified ways
	for (const [nodeId, wayNamesSet] of nodeWayNames.entries()) {
		if (wayNamesSet.size >= 2) {
			const node = nodes.get(nodeId);
			if (node && haversineDistance(lat, lon, node.lat, node.lon) <= radius) {
				intersections.push(node);
			}
		}
	}

	return intersections;
}

/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 */
export function shuffleArray<T>(array: T[]): T[] {
	const newArray = [...array];
	for (let i = newArray.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[newArray[i], newArray[j]] = [newArray[j], newArray[i]];
	}
	return newArray;
}

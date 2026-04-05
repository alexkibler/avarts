import { writable, derived } from 'svelte/store';
import type { Route } from './types';

export const mapNodes = writable<any[]>([]);
export const activeWaypointIds = writable<Set<string>>(new Set());

export const nodeStats = derived(mapNodes, ($nodes) => ({
	hidden: $nodes.filter((n) => n.state === 'Hidden').length,
	available: $nodes.filter((n) => n.state === 'Available').length,
	checked: $nodes.filter((n) => n.state === 'Checked').length
}));

export const currentRoute = writable<Route | null>(null);
export const routeDistance = writable<number>(0);
export const elevationGain = writable<number>(0);

export const userLocation = writable<{ lat: number; lon: number } | null>(null);

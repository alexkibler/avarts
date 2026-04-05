export interface GameSession {
	id: string;
	status: string;
	ap_seed_name?: string;
	ap_server_url?: string;
	ap_slot_name?: string;
	center_lat?: number;
	center_lon?: number;
	radius?: number;
	created?: string;
	updated?: string;
	collectionId?: string;
	collectionName?: string;
}

export interface GameSessions {
	items: GameSession[];
}

export interface User {
	avatar: string;
	collectionId: string;
	collectionName: string;
	created: string;
	emailVisibility: boolean;
	id: string;
	name: string;
	updated: string;
	username: string;
	verified: boolean;
	weight: number;
}

export interface Exercise {
	id: string;
	user: string;
	name: string;
	type: string;
	status: string;
	gpx: string;
	url?: string;
	created: string;
	updated: string;
	collectionId: string;
	collectionName: string;
	sport?: string;
	description?: string;
	start_time?: string | number | Date;
	tot_distance: number;
	elap_time: number;
	tot_elevation: number;
	norm_power?: number;
	tot_calories?: number;
	avg_speed?: number;
	max_speed?: number;
	avg_hr?: number;
	max_hr?: number;
	avg_cadence?: number;
	max_cadence?: number;
	avg_power?: number;
	max_power?: number;
	tot_time?: number;
	image?: string;
	expand: {
		user: User;
	};
}

export interface UserData {
	user: User;
}

export interface UserLocals {
	locals: {
		user: User;
	};
}

export interface Route {
	coordinates: Coordinates;
	actualWaypoints: {
		latLng: Coordinates;
	};
	inputWaypoints: {
		latLng: Coordinates;
	};
	summary: {
		totalDistance: number;
		totalAscend: number;
	};
}

export interface Routes {
	routes: Route[];
	length: number;
}

export interface Waypoints {
	latLng: Coordinates;
}

export interface Coordinate {
	lat: number;
	lng: number;
	meta?: {
		elevation: number;
	};
}

export type Coordinates = Coordinate[];

export interface ElevationResponse {
	results: {
		latitude: number;
		longitude: number;
		elevation: number;
	}[];
}

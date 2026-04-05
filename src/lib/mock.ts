import type { User } from './types';

export class MockAuthStore {
	isValid = true;
	model: User | null = {
		avatar: '',
		collectionId: 'mock_users_collection',
		collectionName: 'users',
		created: new Date().toISOString(),
		emailVisibility: false,
		id: 'mock_user_123',
		name: 'Mock User',
		updated: new Date().toISOString(),
		username: 'mockuser',
		verified: true,
		weight: 75
	};

	loadFromCookie(cookie: string) {}
	exportToCookie(options?: Record<string, unknown>) {
		return 'mock_pb_auth=mock_token; Path=/; SameSite=Lax';
	}
	clear() {
		this.isValid = false;
		this.model = null;
	}
}

export class MockPocketBase {
	authStore = new MockAuthStore();
	files = {
		getUrl: (record: Record<string, unknown>, filename: string) =>
			`http://mock.url/files/${record.collectionId}/${record.id}/${filename}`
	};

	private _sessions: any[] = [
		{
			id: 'mock_session_123',
			ap_seed_name: 'Visual Test Seed',
			ap_server_url: 'test',
			ap_slot_name: 'Player1',
			status: 'Active',
			center_lat: 40.7128,
			center_lon: -74.006,
			radius: 5000
		}
	];

	private _nodes: any[] = Array.from({ length: 5 }, (_, i) => ({
		id: `node_${i}`,
		session: 'mock_session_123',
		ap_location_id: 800001 + i,
		name: `Intersection ${i + 1}`,
		lat: 40.7128 + (i - 2) * 0.005,
		lon: -74.006 + (i - 2) * 0.005,
		state: i >= 2 ? 'Available' : 'Hidden'
	}));

	autoCancellation(cancel: boolean) {}

	collection(name: string) {
		return {
			getFullList: async (options?: any) => {
				if (name === 'game_sessions') return this._sessions;
				if (name === 'map_nodes') {
					let filtered = [...this._nodes];
					if (options?.filter) {
						if (options.filter.includes('session = "mock_session_123"')) {
							filtered = filtered.filter(n => n.session === 'mock_session_123');
						}
						if (options.filter.includes('state = "Available"')) {
							filtered = filtered.filter(n => n.state === 'Available');
						}
						if (options.filter.includes('state = "Hidden"')) {
							filtered = filtered.filter(n => n.state === 'Hidden');
						}
					}
					return filtered;
				}
				return [];
			},
			getOne: async (id: string, options?: any) => {
				if (name === 'game_sessions') {
					const s = this._sessions.find((s) => s.id === id);
					return s || this._sessions[0];
				}
				if (name === 'map_nodes') {
					return this._nodes.find(n => n.id === id) || { id };
				}
				return { id };
			},
			update: async (id: string, data: any) => {
				if (name === 'game_sessions') {
					const s = this._sessions.find((s) => s.id === id);
					if (s) Object.assign(s, data);
					return s || { id, ...data };
				}
				if (name === 'map_nodes') {
					const n = this._nodes.find(node => node.id === id);
					if (n) Object.assign(n, data);
					return n || { id, ...data };
				}
				return { id, ...data };
			},
			subscribe: async (topic: string, callback: (data: any) => void) => {
				return () => {}; 
			}
		};
	}
}

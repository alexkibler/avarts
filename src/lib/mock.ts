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

	private _nodes: any[] = Array.from({ length: 20 }, (_, i) => ({
		id: `node_${i}`,
		session: 'mock_session_123',
		ap_location_id: 800001 + i,
		name: `Intersection ${i + 1}`,
		lat: 40.7128 + (Math.random() - 0.5) * 0.05,
		lon: -74.006 + (Math.random() - 0.5) * 0.05,
		state: i < 5 ? 'Available' : i < 10 ? 'Checked' : 'Hidden'
	}));

	autoCancellation(cancel: boolean) {}

	collection(name: string) {
		return {
			getFullList: async (options?: any) => {
				if (name === 'game_sessions') return this._sessions;
				if (name === 'map_nodes') {
					if (options?.filter?.includes('mock_session_123')) {
						return this._nodes;
					}
					return [];
				}
				if (name === 'activities') return [];
				return [];
			},
			getList: async (page: number, perPage: number, options?: any) => {
				return { items: [], totalItems: 0, totalPages: 0, page: 1, perPage };
			},
			getOne: async (id: string, options?: any) => {
				if (name === 'game_sessions') {
					const s = this._sessions.find((s) => s.id === id);
					return s || this._sessions[0];
				}
				return { id };
			},
			getFirstListItem: async (filter: string, options?: any) => {
				if (name === 'game_sessions') return this._sessions[0];
				return { id: 'mock_id' };
			},
			create: async (data: any) => {
				const newItem = { id: `mock_new_${Math.random()}`, ...data };
				if (name === 'game_sessions') this._sessions.push(newItem);
				return newItem;
			},
			update: async (id: string, data: any) => {
				if (name === 'game_sessions') {
					const s = this._sessions.find((s) => s.id === id);
					if (s) Object.assign(s, data);
					return s || { id, ...data };
				}
				return { id, ...data };
			},
			delete: async (id: string) => {
				return true;
			},
			subscribe: async (topic: string, callback: (data: any) => void) => {
				return () => {}; // Unsubscribe mock
			},
			authWithPassword: async (username: string, pass: string) => {
				return { token: 'mock_token', record: this.authStore.model };
			}
		};
	}
}

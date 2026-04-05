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

	autoCancellation(cancel: boolean) {
		return this;
	}

	private _subscribers: Map<string, Array<(data: any) => void>> = new Map();

	collection(name: string) {
		const self = this;
		return {
			getFullList: async (options?: any) => {
				if (name === 'game_sessions') return self._sessions;
				if (name === 'map_nodes') {
					let filtered = [...self._nodes];
					if (options?.filter) {
						if (options.filter.includes('session = "mock_session_123"')) {
							filtered = filtered.filter((n) => n.session === 'mock_session_123');
						}
						if (options.filter.includes('state = "Available"')) {
							filtered = filtered.filter((n) => n.state === 'Available');
						}
						if (options.filter.includes('state = "Hidden"')) {
							filtered = filtered.filter((n) => n.state === 'Hidden');
						}
					}
					return filtered;
				}
				return [];
			},
			getList: async (page: number, perPage: number, options?: any) => {
				return { items: [], totalItems: 0, totalPages: 0, page: 1, perPage };
			},
			getOne: async (id: string, options?: any) => {
				if (name === 'game_sessions') {
					const s = self._sessions.find((s) => s.id === id);
					return s || self._sessions[0];
				}
				if (name === 'map_nodes') {
					return self._nodes.find((n) => n.id === id) || { id };
				}
				return { id };
			},
			getFirstListItem: async (filter: string, options?: any) => {
				if (name === 'game_sessions') return self._sessions[0];
				return { id: 'mock_id' };
			},
			create: async (data: any) => {
				const newItem = { id: `mock_new_${Math.random()}`, ...data };
				if (name === 'game_sessions') self._sessions.push(newItem);
				if (name === 'map_nodes') self._nodes.push(newItem);
				return newItem;
			},
			update: async (id: string, data: any) => {
				let record: any;
				if (name === 'game_sessions') {
					record = self._sessions.find((s) => s.id === id);
					if (record) Object.assign(record, data);
				}
				if (name === 'map_nodes') {
					record = self._nodes.find((node) => node.id === id);
					if (record) Object.assign(record, data);
				}

				if (record) {
					const topic = `${name}/${id}`;
					const wildTopic = `${name}/*`;
					const event = { action: 'update', record };

					(self._subscribers.get(topic) || []).forEach((cb) => cb(event));
					(self._subscribers.get(wildTopic) || []).forEach((cb) => cb(event));
					(self._subscribers.get('*') || []).forEach((cb) => cb(event));
				}

				return record || { id, ...data };
			},
			delete: async (id: string) => {
				return true;
			},
			subscribe: async (topic: string, callback: (data: any) => void) => {
				const subscribers = self._subscribers.get(topic) || [];
				subscribers.push(callback);
				self._subscribers.set(topic, subscribers);
				return () => {
					const subs = self._subscribers.get(topic) || [];
					self._subscribers.set(
						topic,
						subs.filter((cb) => cb !== callback)
					);
				};
			},
			authWithPassword: async (username: string, pass: string) => {
				return { token: 'mock_token', record: self.authStore.model };
			}
		};
	}
}

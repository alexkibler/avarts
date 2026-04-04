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

	autoCancellation(cancel: boolean) {}

	collection(name: string) {
		return {
			getFullList: async (options?: Record<string, unknown>) => {
				if (name === 'game_sessions') return [];
				if (name === 'map_nodes') return [];
				if (name === 'activities') return [];
				return [];
			},
			getList: async (page: number, perPage: number, options?: Record<string, unknown>) => {
				return { items: [], totalItems: 0, totalPages: 0, page: 1, perPage };
			},
			getOne: async (id: string, options?: Record<string, unknown>) => {
				if (name === 'game_sessions') {
					return { id, ap_server_url: 'test', status: 'Active' };
				}
				return { id };
			},
			getFirstListItem: async (filter: string, options?: Record<string, unknown>) => {
				return { id: 'mock_id' };
			},
			create: async (data: Record<string, unknown>) => {
				return { id: 'mock_new_id', ...data };
			},
			update: async (id: string, data: Record<string, unknown>) => {
				return { id, ...data };
			},
			delete: async (id: string) => {
				return true;
			},
			subscribe: async (topic: string, callback: (data: Record<string, unknown>) => void) => {
				return () => {}; // Unsubscribe mock
			},
			authWithPassword: async (username: string, pass: string) => {
				return { token: 'mock_token', record: this.authStore.model };
			}
		};
	}
}

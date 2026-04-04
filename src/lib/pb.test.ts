import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as envModule from '$env/dynamic/public';

vi.mock('pocketbase', () => {
	const PocketBaseMock = class {
		url: string;
		authStore = {
			loadFromCookie: vi.fn()
		};
		constructor(url: string) {
			this.url = url;
		}
	};
	return { default: PocketBaseMock };
});

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_DB_URL: undefined
	}
}));

describe('pb.ts initialization', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	it('uses http://127.0.0.1:8090 when PUBLIC_DB_URL is omitted', async () => {
		vi.stubGlobal('document', { cookie: '' });
		// Keep it undefined as mocked globally
		(envModule.env as any).PUBLIC_DB_URL = undefined;

		const { pb } = await import('./pb');
		expect((pb as any).url).toBe('http://127.0.0.1:8090');
	});

	it('uses PUBLIC_DB_URL when provided', async () => {
		vi.stubGlobal('document', { cookie: '' });
		// Change for this test
		(envModule.env as any).PUBLIC_DB_URL = 'https://custom-db.example.com';

		const { pb } = await import('./pb');
		expect((pb as any).url).toBe('https://custom-db.example.com');
	});

	it('loads authStore from cookie when in browser environment', async () => {
		vi.stubGlobal('document', { cookie: 'test_cookie=value' });
		const { pb } = await import('./pb');
		expect(pb.authStore.loadFromCookie).toHaveBeenCalledWith('test_cookie=value');
	});
});

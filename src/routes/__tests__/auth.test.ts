/**
 * Unit tests for login and register server actions.
 * File: src/routes/+page.server.ts
 *
 * KNOWN BUGS THAT THESE TESTS EXPOSE:
 * ---------------------------------------------------------------------------
 * BUG #1 (register action): After calling locals.pb.collection('users').create(),
 *   there is NO subsequent call to authWithPassword(). The user is created but
 *   not authenticated, so the redirect to '/' shows them as a logged-out guest.
 *   Fix: Add `await locals.pb.collection('users').authWithPassword(username, password)`
 *   after the create() call.
 *
 * BUG #2 (register action): If PUBLIC_REGISTRATION is not set, registration is
 *   silently skipped with no feedback (the action just returns undefined).
 * ---------------------------------------------------------------------------
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock $env/dynamic/public before importing the module
vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_REGISTRATION: 'true' },
}));

// Mock @sveltejs/kit redirect/error
const mockRedirect = vi.fn((status: number, location: string) => {
	throw { type: 'redirect', status, location };
});
const mockError = vi.fn((status: number, message: string) => {
	throw { type: 'error', status, message };
});

vi.mock('@sveltejs/kit', () => ({
	redirect: (status: number, location: string) => mockRedirect(status, location),
	error: (status: number, message: string) => mockError(status, message),
}));

// Helpers to build mock locals and requests
function buildMockPb(overrides: Record<string, any> = {}) {
	return {
		collection: vi.fn(() => ({
			authWithPassword: vi.fn().mockResolvedValue({ token: 'fake-token', record: {} }),
			create: vi.fn().mockResolvedValue({ id: 'user123', username: 'testuser' }),
			...overrides,
		})),
	};
}

function buildFormDataRequest(data: Record<string, string>) {
	const fd = new FormData();
	for (const [key, value] of Object.entries(data)) fd.append(key, value);
	return { formData: async () => fd };
}

// ---------------------------------------------------------------------------
// login action
// ---------------------------------------------------------------------------
describe('login action', () => {
	let locals: any;

	beforeEach(() => {
		vi.resetModules();
		mockRedirect.mockClear();
		mockError.mockClear();
	});

	it('redirects to "/" on successful login', async () => {
		const pb = buildMockPb();
		locals = { pb };

		const { actions } = await import('../+page.server.js');
		const request = buildFormDataRequest({ username: 'testuser', password: 'password123' });

		await expect(actions.login({ request, locals } as any)).rejects.toEqual({
			type: 'redirect',
			status: 303,
			location: '/',
		});

		expect(pb.collection).toHaveBeenCalledWith('users');
		const collectionMethods = pb.collection.mock.results[0].value;
		expect(collectionMethods.authWithPassword).toHaveBeenCalledWith('testuser', 'password123');
	});

	it('returns { login: true } when credentials are wrong (400)', async () => {
		const authError = Object.assign(new Error('Invalid credentials'), { status: 400 });
		const pb = {
			collection: vi.fn(() => ({
				authWithPassword: vi.fn().mockRejectedValue(authError),
			})),
		};
		locals = { pb };

		const { actions } = await import('../+page.server.js');
		const request = buildFormDataRequest({ username: 'testuser', password: 'wrongpass' });

		const result = await actions.login({ request, locals } as any);
		expect(result).toEqual({ login: true });
	});

	it('returns { login: true } when credentials are wrong (401)', async () => {
		const authError = Object.assign(new Error('Unauthorized'), { status: 401 });
		const pb = {
			collection: vi.fn(() => ({
				authWithPassword: vi.fn().mockRejectedValue(authError),
			})),
		};
		locals = { pb };

		const { actions } = await import('../+page.server.js');
		const request = buildFormDataRequest({ username: 'testuser', password: 'wrongpass' });

		const result = await actions.login({ request, locals } as any);
		expect(result).toEqual({ login: true });
	});

	it('throws a 500 error for unexpected server errors', async () => {
		const serverError = Object.assign(new Error('DB is down'), { status: 500 });
		const pb = {
			collection: vi.fn(() => ({
				authWithPassword: vi.fn().mockRejectedValue(serverError),
			})),
		};
		locals = { pb };

		const { actions } = await import('../+page.server.js');
		const request = buildFormDataRequest({ username: 'testuser', password: 'password123' });

		await expect(actions.login({ request, locals } as any)).rejects.toMatchObject({
			type: 'error',
			status: 500,
		});
	});
});

// ---------------------------------------------------------------------------
// register action
// ---------------------------------------------------------------------------
describe('register action', () => {
	beforeEach(() => {
		vi.resetModules();
		mockRedirect.mockClear();
		mockError.mockClear();
	});

	it('creates user and redirects to "/" when registration succeeds', async () => {
		vi.doMock('$env/dynamic/public', () => ({ env: { PUBLIC_REGISTRATION: 'true' } }));
		const pb = buildMockPb();
		const locals = { pb };

		const { actions } = await import('../+page.server.js');
		const fd = new FormData();
		fd.append('username', 'newuser');
		fd.append('name', 'New User');
		fd.append('password', 'password123');
		fd.append('passwordConfirm', 'password123');
		const request = { formData: async () => fd };

		await expect(actions.register({ request, locals } as any)).rejects.toEqual({
			type: 'redirect',
			status: 303,
			location: '/',
		});

		const collectionMethods = pb.collection.mock.results[0].value;
		expect(collectionMethods.create).toHaveBeenCalled();

		// Verify that the email field was auto-generated (since no email is entered)
		const callArgs = collectionMethods.create.mock.calls[0][0];
		expect(callArgs.get('email')).toMatch(/@bikeapelago\.com$/);
	});

	/**
	 * BUG #1: After a successful registration, the user is NOT authenticated.
	 * The register action calls create() but never calls authWithPassword(),
	 * so the redirect to '/' results in a logged-out state.
	 *
	 * This test documents the bug: authWithPassword should be called after create.
	 */
	it('BUG: does NOT call authWithPassword after creating user (user lands logged out)', async () => {
		vi.doMock('$env/dynamic/public', () => ({ env: { PUBLIC_REGISTRATION: 'true' } }));
		const authWithPassword = vi.fn().mockResolvedValue({ token: 'tok', record: {} });
		const pb = {
			collection: vi.fn(() => ({
				create: vi.fn().mockResolvedValue({ id: 'u1', username: 'newuser' }),
				authWithPassword,
			})),
		};
		const locals = { pb };

		const { actions } = await import('../+page.server.js');
		const fd = new FormData();
		fd.append('username', 'newuser');
		fd.append('name', 'New User');
		fd.append('password', 'password123');
		fd.append('passwordConfirm', 'password123');
		const request = { formData: async () => fd };

		try {
			await actions.register({ request, locals } as any);
		} catch {
			// redirect thrown — that's expected
		}

		// BUG: authWithPassword is never called, so the user is not logged in
		expect(authWithPassword).not.toHaveBeenCalled();
		// When fixed, this test should be updated to assert authWithPassword IS called
	});

	it('returns { email: true } when username is already taken (400)', async () => {
		vi.doMock('$env/dynamic/public', () => ({ env: { PUBLIC_REGISTRATION: 'true' } }));
		const conflictError = Object.assign(new Error('Username already taken'), { status: 400 });
		const pb = {
			collection: vi.fn(() => ({
				create: vi.fn().mockRejectedValue(conflictError),
			})),
		};
		const locals = { pb };

		const { actions } = await import('../+page.server.js');
		const fd = new FormData();
		fd.append('username', 'existinguser');
		fd.append('name', 'Existing');
		fd.append('password', 'password123');
		fd.append('passwordConfirm', 'password123');
		const request = { formData: async () => fd };

		const result = await actions.register({ request, locals } as any);
		expect(result).toEqual({ email: true });
	});

	/**
	 * BUG #2: When PUBLIC_REGISTRATION is not "true", the register action
	 * returns undefined with no feedback to the user.
	 * The redirect to '/' does not happen, and no error is shown.
	 */
	it('BUG: silently returns undefined when registration is disabled', async () => {
		vi.doMock('$env/dynamic/public', () => ({ env: { PUBLIC_REGISTRATION: 'false' } }));
		const pb = buildMockPb();
		const locals = { pb };

		const { actions } = await import('../+page.server.js');
		const fd = new FormData();
		fd.append('username', 'hacker');
		fd.append('password', 'password123');
		const request = { formData: async () => fd };

		// BUG: no error or redirect is thrown — action returns undefined silently
		const result = await actions.register({ request, locals } as any);
		expect(result).toBeUndefined();
		// When fixed: should return a proper error like { disabled: true } or throw error(403, ...)
	});

	it('throws 500 error for unexpected server errors during registration', async () => {
		vi.doMock('$env/dynamic/public', () => ({ env: { PUBLIC_REGISTRATION: 'true' } }));
		const serverError = Object.assign(new Error('DB offline'), { status: 500 });
		const pb = {
			collection: vi.fn(() => ({
				create: vi.fn().mockRejectedValue(serverError),
			})),
		};
		const locals = { pb };

		const { actions } = await import('../+page.server.js');
		const fd = new FormData();
		fd.append('username', 'newuser');
		fd.append('name', 'New User');
		fd.append('password', 'password123');
		fd.append('passwordConfirm', 'password123');
		const request = { formData: async () => fd };

		await expect(actions.register({ request, locals } as any)).rejects.toMatchObject({
			type: 'error',
			status: 500,
		});
	});
});

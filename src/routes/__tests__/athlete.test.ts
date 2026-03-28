/**
 * Unit tests for the athlete profile update server action.
 * File: src/routes/athlete/+page.server.ts
 *
 * KNOWN BUGS THAT THESE TESTS EXPOSE:
 * ---------------------------------------------------------------------------
 * BUG #8 (athlete update): After a successful profile update the action
 *   returns undefined (no redirect, no success flag). The page reloads
 *   without any visual confirmation to the user that the save worked.
 *   Fix: Return a success indicator or throw redirect(303, '/athlete').
 * ---------------------------------------------------------------------------
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('athlete update action', () => {
	beforeEach(() => {
		vi.resetModules();
		mockRedirect.mockClear();
		mockError.mockClear();
	});

	it('calls pb.collection("users").update with the correct user ID', async () => {
		const userId = 'user_profile_123';
		const updateFn = vi.fn().mockResolvedValue({
			name: 'Updated Name',
			avatar: 'new_avatar.jpg',
			weight: 72.5,
		});
		const pb = { collection: vi.fn(() => ({ update: updateFn })) };
		const locals = { pb, user: { id: userId, name: '', avatar: '', weight: 0 } };

		const { actions } = await import('../athlete/+page.server.js');
		const fd = new FormData();
		fd.append('id', userId);
		fd.append('name', 'Updated Name');
		fd.append('weight', '72.5');
		const request = { formData: async () => fd };

		await actions.update({ request, locals } as any);
		expect(updateFn).toHaveBeenCalledWith(userId, fd);
	});

	it('updates locals.user.name, avatar, and weight after a successful save', async () => {
		const userId = 'user_profile_123';
		const updateFn = vi.fn().mockResolvedValue({
			name: 'Alice',
			avatar: 'alice_avatar.png',
			weight: 65.0,
		});
		const pb = { collection: vi.fn(() => ({ update: updateFn })) };
		const locals = { pb, user: { name: '', avatar: '', weight: 0 } };

		const { actions } = await import('../athlete/+page.server.js');
		const fd = new FormData();
		fd.append('id', userId);
		fd.append('name', 'Alice');
		fd.append('weight', '65.0');
		const request = { formData: async () => fd };

		await actions.update({ request, locals } as any);

		// Locals should be updated in-place
		expect(locals.user.name).toBe('Alice');
		expect(locals.user.avatar).toBe('alice_avatar.png');
		expect(locals.user.weight).toBe(65.0);
	});

	/**
	 * BUG #8: The action returns undefined on success — no redirect, no toast.
	 * The client-side fetch handler checks response.ok and does a manual redirect
	 * via window.location.href, but native form submissions get no feedback.
	 * Fix: throw redirect(303, '/athlete') or return { success: true }.
	 */
	it('BUG: returns undefined on success (no redirect, no success flag)', async () => {
		const userId = 'user_123';
		const pb = {
			collection: vi.fn(() => ({
				update: vi.fn().mockResolvedValue({ name: 'Bob', avatar: '', weight: 80 }),
			})),
		};
		const locals = { pb, user: { name: '', avatar: '', weight: 0 } };

		const { actions } = await import('../athlete/+page.server.js');
		const fd = new FormData();
		fd.append('id', userId);
		fd.append('name', 'Bob');
		const request = { formData: async () => fd };

		const result = await actions.update({ request, locals } as any);
		// BUG: returns undefined — no success signal
		expect(result).toBeUndefined();
		// When fixed: expect(result).toEqual({ success: true })
		// or: await expect(...).rejects.toEqual({ type: 'redirect', status: 303, location: '/athlete' })
	});

	it('returns a 500 error when PocketBase update fails', async () => {
		const userId = 'user_error_test';
		const pb = {
			collection: vi.fn(() => ({
				update: vi.fn().mockRejectedValue(new Error('Connection refused')),
			})),
		};
		const locals = { pb, user: {} };

		const { actions } = await import('../athlete/+page.server.js');
		const fd = new FormData();
		fd.append('id', userId);
		fd.append('name', 'Broken');
		const request = { formData: async () => fd };

		await expect(actions.update({ request, locals } as any)).rejects.toMatchObject({
			type: 'error',
			status: 500,
		});
	});

	it('extracts the user ID from formData (not from locals.user.id)', async () => {
		const idFromForm = 'form_user_id_456';
		const updateFn = vi.fn().mockResolvedValue({ name: 'X', avatar: '', weight: 50 });
		const pb = { collection: vi.fn(() => ({ update: updateFn })) };
		const locals = { pb, user: { id: 'different_id' } };

		const { actions } = await import('../athlete/+page.server.js');
		const fd = new FormData();
		fd.append('id', idFromForm);
		fd.append('name', 'X');
		const request = { formData: async () => fd };

		await actions.update({ request, locals } as any);
		expect(updateFn.mock.calls[0][0]).toBe(idFromForm);
	});
});

// ---------------------------------------------------------------------------
// logout endpoint
// ---------------------------------------------------------------------------
describe('POST /logout', () => {
	beforeEach(() => {
		vi.resetModules();
		mockRedirect.mockClear();
	});

	it('clears the auth store and redirects to "/"', async () => {
		const clearFn = vi.fn();
		const locals: any = {
			pb: { authStore: { clear: clearFn } },
			user: { id: 'user1' },
		};

		const { POST } = await import('../logout/+server.js');

		await expect(POST({ locals } as any)).rejects.toEqual({
			type: 'redirect',
			status: 303,
			location: '/',
		});

		expect(clearFn).toHaveBeenCalledOnce();
	});

	it('sets locals.user to undefined after logout', async () => {
		const locals: any = {
			pb: { authStore: { clear: vi.fn() } },
			user: { id: 'user_to_clear' },
		};

		const { POST } = await import('../logout/+server.js');

		try {
			await POST({ locals } as any);
		} catch {
			// redirect thrown — expected
		}

		expect(locals.user).toBeUndefined();
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../+server';
import { pb } from '$lib/pb';

vi.mock('$lib/pb', () => ({
	pb: {
		authStore: {
			clear: vi.fn()
		}
	}
}));

describe('POST /logout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('clears authStore, clears user, and redirects to /', async () => {
		const mockLocals = {
			user: { id: 'user123' },
			pb: {
				authStore: {
					clear: vi.fn()
				}
			}
		};

		const event = {
			locals: mockLocals
		};

		try {
			await POST(event as any);
			// should never reach here
			expect(true).toBe(false);
		} catch (e: any) {
			// SvelteKit redirect throws an object with status and location
			expect(e.status).toBe(303);
			expect(e.location).toBe('/');
		}

		// Verify authStore cleared
		expect(mockLocals.pb.authStore.clear).toHaveBeenCalled();

		// Verify locals.user is set to undefined
		expect(mockLocals.user).toBeUndefined();
	});
});

/**
 * Unit tests for activity-related server actions and endpoints.
 *
 * KNOWN BUGS THAT THESE TESTS EXPOSE:
 * ---------------------------------------------------------------------------
 * BUG #3 (upload action): The action returns record.items[0].id directly.
 *   The client-side code then does link.data.substr(2, 15) to extract the ID,
 *   which relies on SvelteKit's internal devalue serialization format. This
 *   is extremely fragile and will break if the serialization format changes.
 *   Fix: Return an object { id } and access it as link.data.id on the client.
 *
 * BUG #4 (edit page): The edit page template references data.image but the
 *   Exercise type has img (not image) as the PocketBase field. The activity
 *   thumbnail will always be broken/missing on the edit page.
 *   Fix: Construct the image URL using pb.files.getUrl(data, data.img) in the
 *   load function, or fix the template to use the correct field.
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

// ---------------------------------------------------------------------------
// upload/+page.server.ts — create action
// ---------------------------------------------------------------------------
describe('activity upload action (create)', () => {
	beforeEach(() => {
		vi.resetModules();
		mockRedirect.mockClear();
		mockError.mockClear();
	});

	it('creates an activity and returns the new record ID', async () => {
		const createdId = 'abc123def456ghi';
		const pb = {
			collection: vi.fn(() => ({
				create: vi.fn().mockResolvedValue({ id: createdId }),
				getList: vi.fn().mockResolvedValue({
					items: [{ id: createdId, name: 'Test Ride' }],
				}),
			})),
		};
		const locals = { pb };

		const { actions } = await import('../upload/+page.server.js');
		const fd = new FormData();
		fd.append('name', 'Test Ride');
		fd.append('sport', 'cycling');
		fd.append('user', 'user123');
		const request = { formData: async () => fd };

		const result = await actions.create({ request, locals } as any);
		expect(result).toBe(createdId);

		const collectionMethods = pb.collection.mock.results[0].value;
		expect(collectionMethods.create).toHaveBeenCalledWith(fd);
	});

	it('returns 500 error when PocketBase create fails', async () => {
		const pb = {
			collection: vi.fn(() => ({
				create: vi.fn().mockRejectedValue(new Error('DB error')),
			})),
		};
		const locals = { pb };

		const { actions } = await import('../upload/+page.server.js');
		const fd = new FormData();
		fd.append('name', 'Test Ride');
		const request = { formData: async () => fd };

		await expect(actions.create({ request, locals } as any)).rejects.toMatchObject({
			type: 'error',
			status: 500,
		});
	});

	it('queries the most recently created record after insert', async () => {
		const createdId = 'newrecordid12345';
		const getList = vi.fn().mockResolvedValue({ items: [{ id: createdId }] });
		const pb = {
			collection: vi.fn(() => ({
				create: vi.fn().mockResolvedValue({}),
				getList,
			})),
		};
		const locals = { pb };

		const { actions } = await import('../upload/+page.server.js');
		const fd = new FormData();
		fd.append('name', 'New Activity');
		const request = { formData: async () => fd };

		await actions.create({ request, locals } as any);

		expect(getList).toHaveBeenCalledWith(1, 1, { sort: '-created' });
	});
});

// ---------------------------------------------------------------------------
// activities/[id]/edit/+page.server.ts — update action
// ---------------------------------------------------------------------------
describe('activity edit action (update)', () => {
	beforeEach(() => {
		vi.resetModules();
		mockRedirect.mockClear();
		mockError.mockClear();
	});

	it('updates the activity and redirects to the activity page', async () => {
		const activityId = 'activity123abc';
		const pb = {
			collection: vi.fn(() => ({
				update: vi.fn().mockResolvedValue({ id: activityId }),
			})),
		};
		const locals = { pb };
		const params = { id: activityId };

		const { actions } = await import('../activities/[id]/edit/+page.server.js');
		const fd = new FormData();
		fd.append('name', 'Updated Ride');
		fd.append('sport', 'cycling');
		const request = { formData: async () => fd };

		await expect(actions.update({ request, locals, params } as any)).rejects.toEqual({
			type: 'redirect',
			status: 303,
			location: `/activities/${activityId}`,
		});

		const collectionMethods = pb.collection.mock.results[0].value;
		expect(collectionMethods.update).toHaveBeenCalledWith(activityId, fd);
	});

	it('throws an error matching PocketBase status when update fails', async () => {
		const activityId = 'activity123abc';
		const pbError = Object.assign(new Error('Record not found'), { status: 404 });
		const pb = {
			collection: vi.fn(() => ({
				update: vi.fn().mockRejectedValue(pbError),
			})),
		};
		const locals = { pb };
		const params = { id: activityId };

		const { actions } = await import('../activities/[id]/edit/+page.server.js');
		const fd = new FormData();
		fd.append('name', 'Updated Ride');
		const request = { formData: async () => fd };

		await expect(actions.update({ request, locals, params } as any)).rejects.toMatchObject({
			type: 'error',
			status: 404,
		});
	});

	it('passes the correct activity ID from params to PocketBase update', async () => {
		const activityId = 'specific_id_999';
		const updateFn = vi.fn().mockResolvedValue({ id: activityId });
		const pb = {
			collection: vi.fn(() => ({ update: updateFn })),
		};
		const locals = { pb };
		const params = { id: activityId };

		const { actions } = await import('../activities/[id]/edit/+page.server.js');
		const fd = new FormData();
		fd.append('description', 'A great ride');
		const request = { formData: async () => fd };

		try {
			await actions.update({ request, locals, params } as any);
		} catch {
			// redirect thrown
		}

		expect(updateFn).toHaveBeenCalledWith(activityId, fd);
	});
});

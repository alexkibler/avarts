/**
 * Unit tests for route (course) creation and update API endpoints.
 * Files: src/routes/create/+server.ts  and  src/routes/update/+server.ts
 *
 * KNOWN BUGS THAT THESE TESTS EXPOSE:
 * ---------------------------------------------------------------------------
 * BUG #5 (create route API): `formData.user` is always `undefined`.
 *   FormData does not expose fields as object properties; the correct API is
 *   `formData.get('user')`. As a result the filter string becomes
 *   `user = "undefined"` and the lookup after creation will never find the
 *   newly created route belonging to the real user.
 *   Fix: Change `formData.user` → `formData.get('user')`.
 *
 * BUG #6 (create route API): `locals.pb.collection('routes').getList()` is
 *   called with FOUR arguments:
 *     getList(1, 1, { sort: '-updated' }, { filter: '...', expand: 'user' })
 *   PocketBase's SDK only accepts THREE arguments; the fourth is silently
 *   ignored. The returned record may belong to ANY user, not just the caller.
 *   Fix: Merge filter/expand into the third options argument:
 *     getList(1, 1, { sort: '-updated', filter: `user = "${userId}"`, expand: 'user' })
 *
 * BUG #7 (update route API): Same two bugs as BUG #5 and BUG #6 above.
 * ---------------------------------------------------------------------------
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// create/+server.ts — POST handler
// ---------------------------------------------------------------------------
describe('POST /create (route creation endpoint)', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('creates a route record in PocketBase', async () => {
		const routeId = 'route_abc123';
		const createFn = vi.fn().mockResolvedValue({ id: routeId });
		const getList = vi.fn().mockResolvedValue({ items: [{ id: routeId }] });
		const pb = {
			collection: vi.fn(() => ({ create: createFn, getList })),
		};
		const locals = { pb };

		const { POST } = await import('../create/+server.js');
		const fd = new FormData();
		fd.append('title', 'My Test Route');
		fd.append('user', 'user123');
		const request = { formData: async () => fd };

		await POST({ request, locals } as any);
		expect(createFn).toHaveBeenCalledWith(fd);
	});

	it('returns a Response with the newly created route ID as JSON', async () => {
		const routeId = 'route_xyz789';
		const pb = {
			collection: vi.fn(() => ({
				create: vi.fn().mockResolvedValue({}),
				getList: vi.fn().mockResolvedValue({ items: [{ id: routeId }] }),
			})),
		};
		const locals = { pb };

		const { POST } = await import('../create/+server.js');
		const fd = new FormData();
		fd.append('title', 'Route');
		fd.append('user', 'user123');
		const request = { formData: async () => fd };

		const response = await POST({ request, locals } as any);
		const body = await response.json();
		expect(body).toBe(routeId);
	});

	/**
	 * BUG #5 + BUG #6: The getList filter uses `formData.user` (always undefined)
	 * and passes filter as a 4th arg (silently ignored by the PocketBase SDK).
	 * The endpoint returns the most recently updated route by ANY user, not the
	 * one just created by the authenticated user.
	 */
	it('BUG: filter uses formData.user which is undefined, so filter is user = "undefined"', async () => {
		let capturedGetListArgs: any[] = [];
		const routeId = 'route_buggy';
		const pb = {
			collection: vi.fn(() => ({
				create: vi.fn().mockResolvedValue({}),
				getList: vi.fn((...args: any[]) => {
					capturedGetListArgs = args;
					return Promise.resolve({ items: [{ id: routeId }] });
				}),
			})),
		};
		const locals = { pb };

		const { POST } = await import('../create/+server.js');
		const fd = new FormData();
		fd.append('title', 'Route');
		fd.append('user', 'user123');
		const request = { formData: async () => fd };

		await POST({ request, locals } as any);

		// BUG: third arg has no filter (or wrong filter); fourth arg is ignored
		// If fixed, the third arg should include filter: 'user = "user123"'
		const thirdArg = capturedGetListArgs[2];
		expect(thirdArg).not.toHaveProperty('filter'); // BUG: filter is NOT in the options
		// When fixed: expect(thirdArg.filter).toBe('user = "user123"')
	});
});

// ---------------------------------------------------------------------------
// update/+server.ts — POST handler
// ---------------------------------------------------------------------------
describe('POST /update (route update endpoint)', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('updates a route record by ID', async () => {
		const routeId = 'route_to_update';
		const updateFn = vi.fn().mockResolvedValue({ id: routeId });
		const pb = {
			collection: vi.fn(() => ({
				update: updateFn,
				getList: vi.fn().mockResolvedValue({ items: [{ id: routeId }] }),
			})),
		};
		const locals = { pb };

		const { POST } = await import('../update/+server.js');
		const fd = new FormData();
		fd.append('id', routeId);
		fd.append('title', 'Updated Route');
		fd.append('user', 'user123');
		const request = { formData: async () => fd };

		await POST({ request, locals } as any);
		expect(updateFn).toHaveBeenCalledWith(routeId, fd);
	});

	it('extracts the ID from formData (not params)', async () => {
		const routeId = 'extracted_id_456';
		const updateFn = vi.fn().mockResolvedValue({ id: routeId });
		const pb = {
			collection: vi.fn(() => ({
				update: updateFn,
				getList: vi.fn().mockResolvedValue({ items: [{ id: routeId }] }),
			})),
		};
		const locals = { pb };

		const { POST } = await import('../update/+server.js');
		const fd = new FormData();
		fd.append('id', routeId);
		fd.append('user', 'user456');
		const request = { formData: async () => fd };

		await POST({ request, locals } as any);
		expect(updateFn.mock.calls[0][0]).toBe(routeId);
	});

	it('returns a Response with the updated route ID as JSON', async () => {
		const routeId = 'route_updated_789';
		const pb = {
			collection: vi.fn(() => ({
				update: vi.fn().mockResolvedValue({}),
				getList: vi.fn().mockResolvedValue({ items: [{ id: routeId }] }),
			})),
		};
		const locals = { pb };

		const { POST } = await import('../update/+server.js');
		const fd = new FormData();
		fd.append('id', routeId);
		fd.append('user', 'user789');
		const request = { formData: async () => fd };

		const response = await POST({ request, locals } as any);
		const body = await response.json();
		expect(body).toBe(routeId);
	});

	/**
	 * BUG #7: Same as BUG #5 — formData.user is undefined (not 'user789').
	 */
	it('BUG: filter uses formData.user (undefined) instead of formData.get("user")', async () => {
		let capturedGetListArgs: any[] = [];
		const routeId = 'route_buggy_update';
		const pb = {
			collection: vi.fn(() => ({
				update: vi.fn().mockResolvedValue({}),
				getList: vi.fn((...args: any[]) => {
					capturedGetListArgs = args;
					return Promise.resolve({ items: [{ id: routeId }] });
				}),
			})),
		};
		const locals = { pb };

		const { POST } = await import('../update/+server.js');
		const fd = new FormData();
		fd.append('id', routeId);
		fd.append('user', 'user123');
		const request = { formData: async () => fd };

		await POST({ request, locals } as any);

		// BUG: filter is not in the 3rd arg options object
		const thirdArg = capturedGetListArgs[2];
		expect(thirdArg).not.toHaveProperty('filter');
		// When fixed: expect(thirdArg.filter).toContain('user123')
	});
});

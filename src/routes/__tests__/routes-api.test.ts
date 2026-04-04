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
			collection: vi.fn(() => ({ create: createFn, getList }))
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
				getList: vi.fn().mockResolvedValue({ items: [{ id: routeId }] })
			}))
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
	 * FIXED: The getList filter now correctly uses formData.get('user')
	 * and merges the filter and expand options into the 3rd argument.
	 */
	it('correctly sets the filter using formData.get("user") in the 3rd argument', async () => {
		let capturedGetListArgs: any[] = [];
		const routeId = 'route_fixed';
		const pb = {
			collection: vi.fn(() => ({
				create: vi.fn().mockResolvedValue({}),
				getList: vi.fn((...args: any[]) => {
					capturedGetListArgs = args;
					return Promise.resolve({ items: [{ id: routeId }] });
				})
			}))
		};
		const locals = { pb };

		const { POST } = await import('../create/+server.js');
		const fd = new FormData();
		fd.append('title', 'Route');
		fd.append('user', 'user123');
		const request = { formData: async () => fd };

		await POST({ request, locals } as any);

		const thirdArg = capturedGetListArgs[2];
		expect(thirdArg.filter).toBe('user = "user123"');
		expect(thirdArg.expand).toBe('user');
		expect(capturedGetListArgs.length).toBe(3);
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
				getList: vi.fn().mockResolvedValue({ items: [{ id: routeId }] })
			}))
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
				getList: vi.fn().mockResolvedValue({ items: [{ id: routeId }] })
			}))
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
				getList: vi.fn().mockResolvedValue({ items: [{ id: routeId }] })
			}))
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
	 * FIXED: The getList filter now correctly uses formData.get('user')
	 * and merges the filter and expand options into the 3rd argument.
	 */
	it('correctly sets the filter using formData.get("user") in the 3rd argument', async () => {
		let capturedGetListArgs: any[] = [];
		const routeId = 'route_fixed_update';
		const pb = {
			collection: vi.fn(() => ({
				update: vi.fn().mockResolvedValue({}),
				getList: vi.fn((...args: any[]) => {
					capturedGetListArgs = args;
					return Promise.resolve({ items: [{ id: routeId }] });
				})
			}))
		};
		const locals = { pb };

		const { POST } = await import('../update/+server.js');
		const fd = new FormData();
		fd.append('id', routeId);
		fd.append('user', 'user123');
		const request = { formData: async () => fd };

		await POST({ request, locals } as any);

		const thirdArg = capturedGetListArgs[2];
		expect(thirdArg.filter).toBe('user = "user123"');
		expect(thirdArg.expand).toBe('user');
		expect(capturedGetListArgs.length).toBe(3);
	});
});

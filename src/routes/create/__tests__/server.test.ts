import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../+server';
describe('POST /create', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('creates a route and returns the new ID', async () => {
		const mockFormData = new FormData();
		mockFormData.append('user', 'user123');
		mockFormData.append('name', 'Morning Ride');

		const mockRequest = {
			formData: vi.fn().mockResolvedValue(mockFormData)
		};

		const createMock = vi.fn().mockResolvedValue({});
		const getListMock = vi.fn().mockResolvedValue({ items: [{ id: 'route-123' }] });

		const mockLocals = {
			pb: {
				collection: vi.fn().mockReturnValue({
					create: createMock,
					getList: getListMock
				})
			}
		};

		const response = await POST({ request: mockRequest as any, locals: mockLocals as any } as any);

		expect(mockLocals.pb.collection).toHaveBeenCalledWith('routes');
		expect(createMock).toHaveBeenCalledWith(mockFormData);
		expect(getListMock).toHaveBeenCalledWith(1, 1, {
			sort: '-updated',
			filter: 'user = "user123"',
			expand: 'user'
		});

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data).toBe('route-123');
	});

	it('propagates errors from pocketbase', async () => {
		const mockFormData = new FormData();
		const mockRequest = {
			formData: vi.fn().mockResolvedValue(mockFormData)
		};

		const mockLocals = {
			pb: {
				collection: vi.fn().mockReturnValue({
					create: vi.fn().mockRejectedValue(new Error('DB Error'))
				})
			}
		};

		await expect(
			POST({ request: mockRequest as any, locals: mockLocals as any } as any)
		).rejects.toThrow('DB Error');
	});
});

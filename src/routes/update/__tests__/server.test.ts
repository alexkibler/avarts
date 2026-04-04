import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../+server';
describe('POST /update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates a route and returns the updated ID', async () => {
    const mockFormData = new FormData();
    mockFormData.append('id', 'route-123');
    mockFormData.append('user', 'user123');
    mockFormData.append('name', 'Evening Ride');

    const mockRequest = {
      formData: vi.fn().mockResolvedValue(mockFormData)
    };

    const updateMock = vi.fn().mockResolvedValue({});
    const getListMock = vi.fn().mockResolvedValue({ items: [{ id: 'route-123' }] });

    const mockLocals = {
      pb: {
        collection: vi.fn().mockReturnValue({
          update: updateMock,
          getList: getListMock
        })
      }
    };

    const response = await POST({ request: mockRequest as any, locals: mockLocals as any } as any);

    expect(mockLocals.pb.collection).toHaveBeenCalledWith('routes');
    expect(updateMock).toHaveBeenCalledWith('route-123', mockFormData);
    expect(getListMock).toHaveBeenCalledWith(1, 1, {
      sort: '-updated',
      filter: 'user = "user123"',
      expand: 'user'
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toBe('route-123');
  });

  it('propagates errors from pocketbase update', async () => {
    const mockFormData = new FormData();
    mockFormData.append('id', 'route-123');
    const mockRequest = {
      formData: vi.fn().mockResolvedValue(mockFormData)
    };

    const mockLocals = {
      pb: {
        collection: vi.fn().mockReturnValue({
          update: vi.fn().mockRejectedValue(new Error('DB Update Error'))
        })
      }
    };

    await expect(POST({ request: mockRequest as any, locals: mockLocals as any } as any)).rejects.toThrow('DB Update Error');
  });
});

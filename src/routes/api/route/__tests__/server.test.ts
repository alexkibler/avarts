import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../+server';

describe('GET /api/route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('proxies to GraphHopper and returns the response', async () => {
    const mockUrl = new URL('http://localhost/api/route?point=1,2&point=3,4');

    const mockGraphHopperResponse = { paths: [{ distance: 100 }] };
    const fetchMock = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue(mockGraphHopperResponse)
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET({ url: mockUrl } as any);

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8990/route?point=1%2C2&point=3%2C4');

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual(mockGraphHopperResponse);

    vi.unstubAllGlobals();
  });

  it('handles proxy errors', async () => {
    const mockUrl = new URL('http://localhost/api/route?point=1,2');

    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET({ url: mockUrl } as any);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Route lookup failed');

    vi.unstubAllGlobals();
  });
});

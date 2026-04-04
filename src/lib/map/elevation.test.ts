import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getElevationData } from './elevation';
import { env } from '$env/dynamic/public';

vi.mock('$env/dynamic/public', () => ({
  env: {
    PUBLIC_MOCK_MODE: 'false'
  }
}));

describe('getElevationData', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns dummy data when PUBLIC_MOCK_MODE is true', async () => {
    env.PUBLIC_MOCK_MODE = 'true';

    const coordinates = [
      { lat: 10, lng: 20 },
      { lat: 30, lng: 40 }
    ];

    const result = await getElevationData(coordinates);

    expect(result).toEqual([100, 100]);
  });

  it('fetches elevation data when not in mock mode', async () => {
    env.PUBLIC_MOCK_MODE = 'false';

    const coordinates = [{ lat: 10, lng: 20 }];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [{ elevation: 123 }]
      })
    } as Response);

    const result = await getElevationData(coordinates);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.open-elevation.com/api/v1/lookup',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: [{ latitude: 10, longitude: 20 }] })
      })
    );
    expect(result).toEqual([123]);
  });

  it('throws an error if the fetch fails', async () => {
    env.PUBLIC_MOCK_MODE = 'false';
    const coordinates = [{ lat: 10, lng: 20 }];

    global.fetch = vi.fn().mockResolvedValue({
      ok: false
    } as Response);

    // Silence console.error for test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(getElevationData(coordinates)).rejects.toThrow('Failed to fetch elevation data');

    consoleSpy.mockRestore();
  });
});

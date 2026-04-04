import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../+server';

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_GRAPHHOPPER_URL: '',
		PUBLIC_GRAPHHOPPER_API: ''
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		HERE_GEOCODING_API_KEY: '',
		HERE_GEOCODING_ENABLED: 'false'
	}
}));

describe('GET /api/geocode', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns empty hits if query is missing', async () => {
		const url = new URL('http://localhost/api/geocode');
		const response = await GET({ url } as any);
		const data = await response.json();
		expect(data.hits).toEqual([]);
	});

	it('successfully uses nominatim fallback', async () => {
		const url = new URL('http://localhost/api/geocode?q=London&limit=1');
		const mockNominatimResponse = [
			{
				place_id: 1,
				lat: '51.5',
				lon: '-0.1',
				display_name: 'London',
				address: { road: 'Main St', city: 'London' }
			}
		];

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({ ok: false }) // graphhopper local fail
			.mockResolvedValueOnce({
				// nominatim success
				ok: true,
				json: vi.fn().mockResolvedValue(mockNominatimResponse)
			});

		vi.stubGlobal('fetch', fetchMock);

		const response = await GET({ url } as any);

		expect(fetchMock).toHaveBeenLastCalledWith(
			'https://nominatim.openstreetmap.org/search?q=London&format=json&limit=1&accept-language=en&addressdetails=1',
			{ headers: { 'User-Agent': 'Bikeapelago/1.0' } }
		);
		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.hits[0].name).toBe('Main St, London');

		vi.unstubAllGlobals();
	});

	it('returns empty hits array on nominatim external API errors', async () => {
		const url = new URL('http://localhost/api/geocode?q=London&limit=1');

		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			statusText: 'Internal Server Error'
		});
		vi.stubGlobal('fetch', fetchMock);

		const response = await GET({ url } as any);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.hits).toEqual([]);

		vi.unstubAllGlobals();
	});
});

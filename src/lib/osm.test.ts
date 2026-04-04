import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCyclingIntersections, shuffleArray } from './osm';

describe('osm.ts module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchCyclingIntersections', () => {
    it('properly structures the Overpass API query and POSTs it', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ elements: [] }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await fetchCyclingIntersections(40.0, -75.0, 1000);

      expect(fetchMock).toHaveBeenCalledWith('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: expect.stringContaining('way["highway"~"^(residential|tertiary|unclassified|living_street|cycleway|track)$"]["bicycle"!="no"](around:1000,40,-75)'),
      });
    });

    it('handles failed API requests', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(fetchCyclingIntersections(40.0, -75.0, 1000)).rejects.toThrowError('Overpass API request failed: Internal Server Error');
    });

    it('correctly parses elements and identifies nodes that belong to at least two differently named ways', async () => {
      const mockElements = [
        { type: 'node', id: 1, lat: 40.0001, lon: -75.0001, tags: {} },
        { type: 'node', id: 2, lat: 40.0002, lon: -75.0002, tags: {} },
        { type: 'node', id: 3, lat: 40.05, lon: -75.05, tags: {} }, // Distant node
        { type: 'way', id: 101, nodes: [1, 2], tags: { name: 'Main St' } },
        { type: 'way', id: 102, nodes: [1, 3], tags: { name: 'Broad St' } }, // Node 1 is an intersection of Main St and Broad St
      ];

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ elements: mockElements }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchCyclingIntersections(40.0, -75.0, 1000); // 1km radius

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('filters out nodes outside the radius', async () => {
      // Very small radius: 10 meters.
      const mockElements = [
        { type: 'node', id: 1, lat: 40.001, lon: -75.001, tags: {} }, // Distant
        { type: 'way', id: 101, nodes: [1], tags: { name: 'Main St' } },
        { type: 'way', id: 102, nodes: [1], tags: { name: 'Broad St' } },
      ];

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ elements: mockElements }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchCyclingIntersections(40.0, -75.0, 10); // 10m radius

      expect(result).toHaveLength(0); // Intersecting but out of bounds
    });

    it('handles ways without names by using their IDs to distinguish them', async () => {
        const mockElements = [
          { type: 'node', id: 1, lat: 40.0001, lon: -75.0001, tags: {} },
          { type: 'way', id: 101, nodes: [1], tags: {} }, // no name
          { type: 'way', id: 102, nodes: [1], tags: {} }, // no name
        ];

        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ elements: mockElements }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await fetchCyclingIntersections(40.0, -75.0, 1000);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(1);
    });
  });

  describe('shuffleArray', () => {
    it('returns a new array with the same elements', () => {
      const original = [1, 2, 3, 4, 5];
      const result = shuffleArray(original);

      expect(result).not.toBe(original);
      expect(result).toHaveLength(original.length);
      expect(result).toEqual(expect.arrayContaining(original));
    });

    it('randomizes the array elements', () => {
      const original = Array.from({ length: 100 }, (_, i) => i);
      const result = shuffleArray(original);

      // It's statistically highly improbable that a shuffled array of 100 elements
      // will be in exactly the same order.
      expect(result).not.toEqual(original);
    });
  });
});

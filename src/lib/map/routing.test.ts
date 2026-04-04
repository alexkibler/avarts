import { describe, it, expect } from 'vitest';
import { getDistance, getPermutations, findOptimalRoute } from './routing';

describe('routing', () => {
  describe('getDistance', () => {
    it('calculates distance between two points', () => {
      // New York City to Los Angeles
      const nyc = { lat: 40.7128, lon: -74.0060 };
      const la = { lat: 34.0522, lon: -118.2437 };

      const distance = getDistance(nyc, la);
      // Rough distance is ~3935km
      expect(distance).toBeGreaterThan(3900);
      expect(distance).toBeLessThan(4000);
    });

    it('returns 0 for the same point', () => {
      const p1 = { lat: 40.7128, lon: -74.0060 };
      expect(getDistance(p1, p1)).toBe(0);
    });
  });

  describe('getPermutations', () => {
    it('returns permutations of an array', () => {
      const arr = [1, 2, 3];
      const perms = getPermutations(arr);

      expect(perms.length).toBe(6); // 3! = 6
      expect(perms).toContainEqual([1, 2, 3]);
      expect(perms).toContainEqual([1, 3, 2]);
      expect(perms).toContainEqual([2, 1, 3]);
      expect(perms).toContainEqual([2, 3, 1]);
      expect(perms).toContainEqual([3, 1, 2]);
      expect(perms).toContainEqual([3, 2, 1]);
    });

    it('returns array for single element', () => {
      expect(getPermutations([1])).toEqual([[1]]);
    });

    it('returns empty array for empty input', () => {
      expect(getPermutations([])).toEqual([[]]);
    });
  });

  describe('findOptimalRoute', () => {
    it('finds the shortest path visiting all destinations', () => {
      const startPoint = { lat: 0, lon: 0 };
      const destinations = [
        { lat: 0, lon: 2 },
        { lat: 0, lon: 1 },
        { lat: 0, lon: 3 }
      ];

      const result = findOptimalRoute(startPoint, destinations);

      // Should go to 1, then 2, then 3.
      expect(result.optimalOrder[0]).toEqual(startPoint);
      expect(result.optimalOrder[1]).toEqual(destinations[1]); // lon: 1
      expect(result.optimalOrder[2]).toEqual(destinations[0]); // lon: 2
      expect(result.optimalOrder[3]).toEqual(destinations[2]); // lon: 3
    });
  });
});

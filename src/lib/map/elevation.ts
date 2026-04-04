import { env } from '$env/dynamic/public';
import type { Coordinates, ElevationResponse } from '$lib/types';

export async function getElevationData(coordinates: Coordinates) {
  try {
    const apiUrl = 'https://api.open-elevation.com/api/v1/lookup';
    const locations = coordinates.map(coord => ({
      latitude: coord.lat,
      longitude: coord.lng
    }));

    if (env.PUBLIC_MOCK_MODE === 'true') {
      return locations.map(() => 100); // Dummy elevation
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
    });

    if (response.ok) {
      const data: ElevationResponse = await response.json();
      return data.results.map(result => result.elevation);
    } else {
      throw new Error('Failed to fetch elevation data');
    }
  } catch (error) {
    console.error('Error in getElevationData:', error);
    throw error;
  }
}

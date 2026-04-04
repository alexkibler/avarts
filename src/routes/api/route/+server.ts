import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { env } from '$env/dynamic/public';

export const GET: RequestHandler = async ({ url }) => {
  if (env.PUBLIC_MOCK_MODE === 'true') {
    return json({
      paths: [{
        distance: 1000,
        time: 300000,
        ascend: 10,
        descend: 10,
        points: { type: "LineString", coordinates: [[-74.006, 40.7128], [-74.005, 40.7129]] },
        snapped_waypoints: { type: "LineString", coordinates: [[-74.006, 40.7128], [-74.005, 40.7129]] }
      }]
    });
  }

  const targetUrl = new URL('http://127.0.0.1:8990/route');

  // Forward all query parameters
  for (const [key, value] of url.searchParams) {
    targetUrl.searchParams.append(key, value);
  }

  try {
    const response = await fetch(targetUrl.toString());
    const data = await response.json();
    return json(data);
  } catch (err) {
    console.error('[Route] Error proxying to GraphHopper:', err);
    return json({ error: 'Route lookup failed' }, { status: 500 });
  }
};

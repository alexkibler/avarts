import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
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

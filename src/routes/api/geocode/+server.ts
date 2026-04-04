import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q');
  const locale = url.searchParams.get('locale') || 'en';
  const limit = url.searchParams.get('limit') || '5';

  if (!q) return json({ hits: [] });

  if (publicEnv.PUBLIC_MOCK_MODE === 'true') {
    return json({
      hits: [{
        name: "Mock Location",
        point: { lat: 40.7128, lng: -74.0060 }
      }]
    });
  }

  const defaultUrl = 'http://127.0.0.1:8990/route';
  const effectiveUrl = publicEnv.PUBLIC_GRAPHHOPPER_URL || defaultUrl;
  const geocodeBase = effectiveUrl.replace('/route', '/geocode');
  const graphApi = publicEnv.PUBLIC_GRAPHHOPPER_API;
  const hereKey = privateEnv.HERE_GEOCODING_API_KEY;
  const hereEnabled = privateEnv.HERE_GEOCODING_ENABLED === 'true';

  // ── HERE Geocoding ───────────────────────────────────────────────────────────
  // Primary: best US/global coverage, 30M free requests/month
  async function fetchHere(): Promise<{ hits: any[] } | null> {
    if (!hereKey) return null;
    console.log(`[Geocode] Trying HERE for: ${q}`);
    try {
      const hereUrl = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(q!)}&limit=${limit}&lang=${locale}&apiKey=${hereKey}`;
      const resp = await fetch(hereUrl);
      if (!resp.ok) throw new Error(`HERE returned ${resp.status}`);
      const data = await resp.json();
      const hits = (data.items || []).map((item: any) => {
        const a = item.address || {};
        const street = [a.houseNumber, a.street].filter(Boolean).join(' ');
        const city = a.city || a.county || '';
        const state = a.stateCode || a.state || '';
        const postcode = a.postalCode || '';
        const parts = [street, city ? `${city}${state ? ' ' + state : ''}` : state, postcode].filter(Boolean);
        return {
          name: parts.join(', ') || item.title,
          point: { lat: item.position.lat, lng: item.position.lng },
          extent: item.mapView ? [
            item.mapView.west, item.mapView.south,
            item.mapView.east, item.mapView.north
          ] : undefined
        };
      });
      return hits.length > 0 ? { hits } : null;
    } catch (err) {
      console.warn('[Geocode] HERE failed:', err);
      return null;
    }
  }

  // ── Nominatim (OSM) ──────────────────────────────────────────────────────────
  // Fallback: free but lower US coverage for newer streets
  function formatNominatimAddress(item: any): string {
    if (!item.address) return item.display_name;
    const a = item.address;
    const street = [a.house_number, a.road].filter(Boolean).join(' ');
    const city = a.city || a.town || a.village || a.hamlet || '';
    const stateMap: Record<string, string> = {
      'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
      'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
      'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
      'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
      'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO',
      'Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ',
      'New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH',
      'Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
      'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
      'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY'
    };
    const state = stateMap[a.state] || a.state || '';
    const postcode = a.postcode || '';
    let out = street;
    if (city) out += (out ? ', ' : '') + city;
    if (state) out += (city ? ' ' : out ? ', ' : '') + state;
    if (postcode) out += (out ? ', ' : '') + postcode;
    return out || item.display_name;
  }

  async function fetchNominatim(): Promise<{ hits: any[] }> {
    console.log(`[Geocode] Falling back to Nominatim for: ${q}`);
    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q!)}&format=json&limit=${limit}&accept-language=${locale}&addressdetails=1`;
      const resp = await fetch(nominatimUrl, { headers: { 'User-Agent': 'Bikeapelago/1.0' } });
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      const hits = data.map((item: any) => ({
        name: formatNominatimAddress(item),
        point: { lat: parseFloat(item.lat), lng: parseFloat(item.lon) },
        extent: item.boundingbox ? [
          parseFloat(item.boundingbox[2]), parseFloat(item.boundingbox[0]),
          parseFloat(item.boundingbox[3]), parseFloat(item.boundingbox[1])
        ] : undefined
      }));
      return { hits };
    } catch (err) {
      console.error('[Geocode] Nominatim failed:', err);
      return { hits: [] };
    }
  }

  // ── Routing chain ────────────────────────────────────────────────────────────

  // 1. Try local GraphHopper geocoder (if configured locally)
  if (!geocodeBase.includes('graphhopper.com')) {
    try {
      const targetUrl = new URL(geocodeBase);
      targetUrl.searchParams.set('q', q);
      targetUrl.searchParams.set('locale', locale);
      targetUrl.searchParams.set('limit', limit);
      if (graphApi) targetUrl.searchParams.set('key', graphApi);
      const response = await fetch(targetUrl.toString());
      if (response.ok) {
        const data = await response.json();
        if (data.hits?.length > 0) return json(data);
      }
    } catch {
      // local GH not available, continue
    }
  }

  // 2. Try HERE (best coverage, requires API key + HERE_GEOCODING_ENABLED=true in .env)
  if (hereEnabled) {
    const hereResult = await fetchHere();
    if (hereResult) return json(hereResult);
  }

  // 3. Try GraphHopper Cloud (if cloud API key set)
  if (graphApi) {
    try {
      const cloudUrl = `https://graphhopper.com/api/1/geocode?q=${encodeURIComponent(q)}&key=${graphApi}&limit=${limit}&locale=${locale}`;
      const cloudRes = await fetch(cloudUrl);
      if (cloudRes.ok) {
        const cloudData = await cloudRes.json();
        if (cloudData.hits?.length > 0) return json(cloudData);
      }
    } catch { /* ignore */ }
  }

  // 4. Last resort: Nominatim (free, OSM-based)
  return json(await fetchNominatim());
};

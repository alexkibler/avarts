"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchCyclingIntersections, shuffleArray } from '@/lib/osm';
import { pb } from '@/lib/database';

export default function SetupSessionPage() {
  const router = useRouter();
  const params = useParams();
  const seedId = params.seedId as string;

  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [centerMarker, setCenterMarker] = useState<L.Marker | null>(null);
  const [radiusCircle, setRadiusCircle] = useState<L.Circle | null>(null);

  const [centerLat, setCenterLat] = useState(40.4406);
  const [centerLon, setCenterLon] = useState(-79.9959);
  const [radius, setRadius] = useState(5000);
  const [addressQuery, setAddressQuery] = useState('');

  const [loadError, setLoadError] = useState('');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');

  const [sessionData, setSessionData] = useState<any>(null);

  useEffect(() => {
    async function loadSession() {
      try {
        const session = await pb.collection('game_sessions').getOne(seedId);
        setSessionData(session);
        if (session.status === 'Active') {
          router.push(`/game/${seedId}`);
        }
      } catch (err: any) {
        setLoadError(err.message || 'Session not found.');
      }
    }
    loadSession();
  }, [seedId, router]);

  useEffect(() => {
    if (!mapRef.current || map) return;

    // Use custom marker icon to avoid missing default image issues in Next.js
    const defaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
    });
    L.Marker.prototype.options.icon = defaultIcon;

    const newMap = L.map(mapRef.current).setView([centerLat, centerLon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(newMap);

    const marker = L.marker([centerLat, centerLon], { draggable: true }).addTo(newMap);
    const circle = L.circle([centerLat, centerLon], { radius, color: '#e67e22', fillColor: '#e67e22', fillOpacity: 0.1 }).addTo(newMap);

    marker.on('dragend', function (e) {
      const pos = e.target.getLatLng();
      setCenterLat(pos.lat);
      setCenterLon(pos.lng);
      circle.setLatLng(pos);
      newMap.panTo(pos);
    });

    setMap(newMap);
    setCenterMarker(marker);
    setRadiusCircle(circle);

    return () => {
      newMap.remove();
    };
  }, []);

  useEffect(() => {
    if (radiusCircle && map) {
      radiusCircle.setRadius(radius);
      map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] });
    }
  }, [radius, radiusCircle, map]);

  const handleGeocode = async () => {
    if (!addressQuery.trim()) return;
    setIsGeocoding(true);
    setGeocodeError('');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressQuery)}`);
      if (!res.ok) throw new Error('Geocoding failed');
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        updateMapCenter(lat, lon);
      } else {
        setGeocodeError('Address not found.');
      }
    } catch (err) {
      setGeocodeError('Error searching address.');
    } finally {
      setIsGeocoding(false);
    }
  };

  const getUserLocation = () => {
    setIsLocating(true);
    setLocationError('');
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          updateMapCenter(position.coords.latitude, position.coords.longitude);
          setIsLocating(false);
        },
        (error) => {
          setLocationError('Could not get your location. Please check your browser permissions.');
          setIsLocating(false);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      setLocationError('Geolocation is not supported by your browser.');
      setIsLocating(false);
    }
  };

  const updateMapCenter = (lat: number, lon: number) => {
    setCenterLat(lat);
    setCenterLon(lon);
    if (map && centerMarker && radiusCircle) {
      const latlng = new L.LatLng(lat, lon);
      map.setView(latlng, 13);
      centerMarker.setLatLng(latlng);
      radiusCircle.setLatLng(latlng);
      map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] });
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationError('');

    try {
      let checkCount = 10;
      if (sessionData && sessionData.ap_server_url) {
        // Mock API logic for now since this isn't connected to AP yet
        checkCount = 10;
      }

      console.log(`[Setup] Fetching Overpass data. Target nodes: ${checkCount}`);

      const intersections = await fetchCyclingIntersections(centerLat, centerLon, radius);

      if (intersections.length < checkCount) {
        throw new Error(`Found ${intersections.length} cycling intersections, but need ${checkCount}. Increase the radius or choose a denser area.`);
      }

      const selected = shuffleArray(intersections).slice(0, checkCount);
      console.log(`[Setup] Selected ${selected.length} nodes for the game.`);

      const nodePromises = selected.map((node, i) => {
        return pb.collection('map_nodes').create({
          session: seedId,
          ap_location_id: 800001 + i, // Base AP Location ID offset
          lat: node.lat,
          lon: node.lon,
          name: `Intersection ${node.id}`,
          state: 'Hidden'
        });
      });

      await Promise.all(nodePromises);

      await pb.collection('game_sessions').update(seedId, {
        center_lat: centerLat,
        center_lon: centerLon,
        radius,
        status: 'Active'
      });

      router.push(`/game/${seedId}`);
    } catch (e: any) {
      console.error(e);
      setGenerationError(e.message || 'Failed to generate nodes.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (loadError) {
    return <div className="text-white p-8 text-center">{loadError}</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-950 overflow-hidden">
      <header className="flex-none bg-neutral-900 border-b border-white/5 py-4 px-6 shadow-md z-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/new-game')} className="text-neutral-400 hover:text-white transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div>
            <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded md bg-orange-500/10 text-orange-500 font-bold text-[10px] uppercase tracking-wider mb-1">
              Step 2 of 2
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Select Play Area</h1>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
        <div className="flex-1 relative order-2 md:order-1 h-[40vh] md:h-auto">
          <div ref={mapRef} className="absolute inset-0 z-0"></div>

          {/* Controls overlay for map */}
          <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2">
            <button
              onClick={getUserLocation}
              disabled={isLocating}
              className="bg-neutral-900/90 backdrop-blur border border-white/10 hover:bg-neutral-800 text-white p-3 rounded-xl shadow-lg transition-colors flex items-center justify-center group"
              title="Find my location"
            >
              {isLocating ? (
                <svg className="animate-spin h-5 w-5 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 group-hover:text-orange-500 transition-colors"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              )}
            </button>
          </div>
        </div>

        <div className="w-full md:w-[400px] lg:w-[450px] bg-neutral-900 border-l border-white/5 order-1 md:order-2 flex flex-col shadow-2xl z-10 shrink-0 h-[60vh] md:h-auto overflow-y-auto">
          <div className="p-6 md:p-8 flex-1 flex flex-col">
            <div className="mb-8">
              <p className="text-neutral-400 text-sm leading-relaxed">
                Choose the center point and radius for your game. Checks will be distributed to cycling-accessible intersections within this area.
              </p>
            </div>

            <div className="space-y-6">
              <div className="relative">
                <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2">
                  Search Address
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addressQuery}
                    onChange={(e) => setAddressQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGeocode()}
                    placeholder="e.g. Central Park, NY"
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                  <button
                    onClick={handleGeocode}
                    disabled={isGeocoding}
                    className="bg-neutral-800 hover:bg-neutral-700 border border-white/5 text-white px-4 rounded-xl transition flex items-center justify-center disabled:opacity-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  </button>
                </div>
                {(geocodeError || locationError) && (
                  <p className="text-red-400 text-xs mt-2">{geocodeError || locationError}</p>
                )}
              </div>

              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider">
                    Play Area Radius
                  </label>
                  <span className="text-orange-400 font-mono font-bold">
                    {(radius / 1000).toFixed(1)} km
                  </span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="20000"
                  step="500"
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="w-full h-2 bg-black/40 rounded-lg appearance-none cursor-pointer accent-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
                <div className="flex justify-between text-xs text-neutral-600 mt-2 font-mono">
                  <span>1 km</span>
                  <span>20 km</span>
                </div>
              </div>

              <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 text-neutral-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Coordinates: <span className="text-white font-mono">{centerLat.toFixed(4)}, {centerLon.toFixed(4)}</span>
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      Drag the marker on the map to fine-tune your center point.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-auto pt-8">
              {generationError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">
                  {generationError}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full group bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg shadow-orange-900/20 disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {isGenerating ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Generating Map Data...
                  </>
                ) : (
                  <>
                    Start Session
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

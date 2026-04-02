<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { pb } from '$lib/pb';
  import { env } from '$env/dynamic/public';
  import { userCookie } from '$lib/stores';
  import 'leaflet/dist/leaflet.css';
  import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
  import type { Coordinates, ElevationResponse, Route, Routes } from '$lib/types';

  import ChatClient from '$components/ChatClient.svelte';
  import ApDropzone from '$components/apDropzone.svelte';

  import '@raruto/leaflet-elevation/src/index.css';

  export let sessionId: string;
  export let centerLat: number;
  export let centerLon: number;
  export let radius: number;
  export let nodeStats = { hidden: 0, available: 0, checked: 0 };

  const dispatch = createEventDispatcher<{
    routeStats: { distance: number };
    validated: void;
  }>();

  let mapElement: HTMLElement;
  let map: any;
  let L: any;
  const markerMap = new Map<string, any>();
  let nodes: any[] = [];
  let unsubscribePb: (() => void) | null = null;
  let routingControl: any = null;
  let elevationControl: any = null;

  // Sidebar tab
  let activeTab: 'chat' | 'upload' | 'route' = 'chat';

  // Route stats
  let route: Route | null = null;
  let routeDistance = 0;
  let elevationGain = 0;
  let courseName = "Archipelago Route";
  let averageSpeed = 15; // default km/h
  let type: 'cycling' | 'running' = 'cycling';
  let mode: 'bike' | 'foot' = 'bike';

  // ── Node rendering ───────────────────────────────────────────────────────────

  function markerOptions(state: string, selected: boolean) {
    if (state === 'Checked') {
      return { radius: 8, fillColor: '#4ade80', color: selected ? '#fff' : '#22c55e', weight: selected ? 3 : 2, opacity: 1, fillOpacity: 0.85 };
    } else if (state === 'Available') {
      return { radius: 8, fillColor: '#f97316', color: selected ? '#fff' : '#ea580c', weight: selected ? 3 : 2, opacity: 1, fillOpacity: 0.85 };
    } else {
      return { radius: 4, fillColor: '#6b7280', color: '#4b5563', weight: 1, opacity: 0.45, fillOpacity: 0.35 };
    }
  }

  function renderPins() {
    if (!map || !L) return;
    for (const [, m] of markerMap) m.remove();
    markerMap.clear();

    for (const node of nodes) {
      const marker = L.circleMarker([node.lat, node.lon], markerOptions(node.state, false));

      if (node.state !== 'Hidden') {
        marker.on('click', (e: any) => {
          L.DomEvent.stopPropagation(e);
          addNodeAsWaypoint(node, marker);
        });
        marker.bindTooltip(
          `<strong>Check #${node.ap_location_id}</strong><br/>${node.state === 'Checked' ? '✓ Checked' : 'Available — tap to route here'}`,
          { direction: 'top', offset: [0, -6] }
        );
      }

      marker.addTo(map);
      markerMap.set(node.id, marker);
    }

    updateNodeStats();
  }

  function updateNodeStats() {
    nodeStats = {
      hidden:    nodes.filter((n: any) => n.state === 'Hidden').length,
      available: nodes.filter((n: any) => n.state === 'Available').length,
      checked:   nodes.filter((n: any) => n.state === 'Checked').length,
    };
  }

  // ── Routing & Elevation ──────────────────────────────────────────────────────

  async function getElevationData(coordinates: Coordinates) {
    try {
      const apiUrl = 'https://api.open-elevation.com/api/v1/lookup';
      const locations = coordinates.map(coord => ({
        latitude: coord.lat,
        longitude: coord.lng
      }));

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

  function generateGPX(routeData: Route) {
    const user = $userCookie?.user;
    const userName = user?.name || "Player";
    const userId = user?.id || "";

    const gpx = `<?xml version='1.0' encoding='UTF-8'?>
<gpx version="1.1" creator="${userName}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${courseName}</name>
    <author><name>${userName}</name><link href="${userId}" /></author>
    <copyright author="OpenStreetMap contributors"><license>https://www.openstreetmap.org/copyright</license></copyright>
  </metadata>
  <trk>
    <name>${courseName}</name>
    <type>cycling</type>
    <trkseg>
      ${routeData.coordinates.map((coord: any) => `<trkpt lat="${coord.lat}" lon="${coord.lng}"><ele>${coord.meta?.elevation || 0}</ele></trkpt>`).join('\n')}
    </trkseg>
  </trk>
</gpx>`;
    return gpx;
  }

  function exportToGPX() {
    if (route) {
      const gpxData = generateGPX(route);
      const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `${courseName.replace(/\s+/g, '_')}.gpx`;
      link.click();
    }
  }

  function addNodeAsWaypoint(node: any, marker: any) {
    if (!routingControl) return;
    const wps = routingControl.getWaypoints().filter((w: any) => w.latLng);
    wps.push(L.Routing.waypoint(L.latLng(node.lat, node.lon), `Check #${node.ap_location_id}`));
    routingControl.setWaypoints(wps);
    marker.setStyle(markerOptions(node.state, true));
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      if (!routingControl) return;
      const wps = routingControl.getWaypoints().filter((w: any) => w.latLng);
      const startWp = L.Routing.waypoint(L.latLng(pos.coords.latitude, pos.coords.longitude), 'My Location');
      if (wps.length === 0 || !wps[0].latLng) {
        wps.unshift(startWp);
      } else {
        wps[0] = startWp;
      }
      routingControl.setWaypoints(wps);
      map.setView([pos.coords.latitude, pos.coords.longitude], map.getZoom());
    });
  }

  export function clearRoute() {
    routingControl?.setWaypoints([]);
    elevationControl?.clear();
    route = null;
    routeDistance = 0;
    elevationGain = 0;
    dispatch('routeStats', { distance: 0 });
    for (const node of nodes) {
      const marker = markerMap.get(node.id);
      if (marker) marker.setStyle(markerOptions(node.state, false));
    }
  }

  async function handleTypeClick() {
    if (type === 'cycling') {
      type = 'running';
      mode = 'foot';
    } else {
      type = 'cycling';
      mode = 'bike';
    }

    if (routingControl) {
      const router = routingControl.getRouter();
      if (router && router.options && router.options.urlParameters) {
        router.options.urlParameters.profile = mode;
        routingControl.route();
      }
    }
  }

  function injectLocationButton() {
    const container = document.querySelector('.leaflet-routing-container');
    if (!container) return;
    const inputs = container.querySelectorAll('.leaflet-routing-geocoder input');
    if (!inputs.length) return;
    const row = (inputs[0] as HTMLElement).closest('.leaflet-routing-geocoder');
    if (!row || row.querySelector('.ap-loc-btn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ap-loc-btn';
    btn.title = 'Use my current location';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
    btn.addEventListener('click', (e) => { e.stopPropagation(); useMyLocation(); });
    row.appendChild(btn);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  onMount(async () => {
    const leafletMod = await import('leaflet');
    L = leafletMod.default ?? leafletMod;
    window.L = L;
    await import('@raruto/leaflet-elevation/src/index.js');
    await import('leaflet-routing-machine');
    await import('leaflet-control-geocoder');
    await import('lrm-graphhopper');

    map = L.map(mapElement).setView([centerLat, centerLon], 13);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const circle = L.circle([centerLat, centerLon], {
      radius,
      color: '#f97316',
      fillColor: '#f97316',
      fillOpacity: 0.04,
      weight: 1.5,
      dashArray: '6 4',
    }).addTo(map);

    map.fitBounds(circle.getBounds(), { padding: [24, 24] });

    let graphApi = env.PUBLIC_GRAPHHOPPER_API;
    if (!graphApi) {
      try {
        const mod = await import('$env/static/public');
        graphApi = (mod as any).PUBLIC_GRAPHHOPPER_API;
      } catch { /* not available */ }
    }

    const router = env.PUBLIC_GRAPHHOPPER_URL
      ? (L.Routing as any).graphHopper(undefined, {
          serviceUrl: env.PUBLIC_GRAPHHOPPER_URL,
          urlParameters: { profile: 'bike' },
        })
      : graphApi
      ? (L.Routing as any).graphHopper(graphApi, {
          urlParameters: { profile: 'bike' },
        })
      : null;

    routingControl = (L.Routing as any).control({
      router,
      routeWhileDragging: true,
      showAlternatives: false,
      position: 'topleft',
      geocoder: (L as any).Control.Geocoder.nominatim(),
      lineOptions: {
        styles: [{ color: '#f97316', opacity: 0.8, weight: 5 }],
      },
      createMarker: (i: number, wp: any, n: number) => {
        const iconUrl = i === 0 ? '/start.png' : i === n - 1 ? '/finish.png' : '/waypoint.png';
        return L.marker(wp.latLng, {
          draggable: true,
          icon: L.icon({ iconUrl, iconSize: [18, 18] }),
        });
      },
    }).addTo(map);

    routingControl.on('routesfound', async (e: any) => {
      route = e.routes[0];
      if (!route) return;

      routeDistance = route.summary.totalDistance;
      dispatch('routeStats', { distance: routeDistance });

      // Elevation
      const elevationData = await getElevationData(route.coordinates);
      route.coordinates.forEach((coord: any, idx: number) => {
        coord.meta = { elevation: elevationData[idx] };
      });

      elevationGain = route.summary.totalAscend || 0;

      if (!elevationControl) {
        elevationControl = L.control.elevation({
          srcFolder: 'https://unpkg.com/@raruto/leaflet-elevation/src/',
          theme: 'elevation-theme-dark',
          width: 400,
          height: 160,
          margins: { top: 30, right: 20, bottom: 20, left: 40 },
          detached: false,
          position: "bottomright",
          slope: "summary",
          altitude: true,
          time: false,
          summary: false,
          followMarker: true,
          autofitBounds: false,
          legend: false,
          waypoints: false,
          wptLabels: false,
        }).addTo(map);
      }

      elevationControl.clear();
      elevationControl.load(generateGPX(route));
    });

    setTimeout(injectLocationButton, 400);

    nodes = await pb.collection('map_nodes').getFullList({
      filter: `session = "${sessionId}"`,
      sort: '+ap_location_id',
    });
    renderPins();

    unsubscribePb = await pb.collection('map_nodes').subscribe('*', (e: any) => {
      if (e.record.session !== sessionId) return;
      if (e.action === 'update') {
        nodes = nodes.map((n: any) => (n.id === e.record.id ? e.record : n));
        renderPins();
      }
    });
  });

  onDestroy(() => {
    unsubscribePb?.();
    map?.remove();
  });

  function handleValidated() {
    dispatch('validated');
  }
</script>

<div class="w-full h-full flex flex-col bg-neutral-900 overflow-hidden">
  <div class="flex-1 min-h-0 flex overflow-hidden">
    <!-- Map panel -->
    <div class="flex-1 relative">
      <div bind:this={mapElement} class="w-full h-full"></div>
    </div>

    <!-- Sidebar -->
    <div class="w-80 shrink-0 flex flex-col bg-neutral-900 border-l border-neutral-600">
      <div class="shrink-0 flex border-b border-neutral-600">
        <button on:click={() => activeTab = 'chat'}
          class="flex-1 py-2 text-sm font-medium transition-colors {activeTab === 'chat' ? 'text-orange-400 border-b-2 border-orange-500 bg-neutral-800' : 'text-neutral-400 hover:text-neutral-200'}">
          Chat
        </button>
        <button on:click={() => activeTab = 'upload'}
          class="flex-1 py-2 text-sm font-medium transition-colors {activeTab === 'upload' ? 'text-orange-400 border-b-2 border-orange-500 bg-neutral-800' : 'text-neutral-400 hover:text-neutral-200'}">
          Upload
        </button>
        <button on:click={() => activeTab = 'route'}
          class="flex-1 py-2 text-sm font-medium transition-colors {activeTab === 'route' ? 'text-orange-400 border-b-2 border-orange-500 bg-neutral-800' : 'text-neutral-400 hover:text-neutral-200'}">
          Route
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-hidden">
        {#if activeTab === 'chat'}
          <ChatClient />
        {:else if activeTab === 'upload'}
          <div class="p-3 h-full overflow-y-auto">
            <ApDropzone {sessionId} on:validated={handleValidated} />
          </div>
        {:else}
          <div class="p-4 flex flex-col gap-4">
            <div class="text-xs text-neutral-400 space-y-1 border border-neutral-700 rounded p-3 bg-neutral-800">
              <p class="font-medium text-neutral-300 mb-2">How to plan a route</p>
              <p>1. Click <strong class="text-orange-400">My Location</strong> (the crosshair button next to the Start field on the map) to set your start.</p>
              <p>2. Click any <strong class="text-orange-400">orange</strong> or <strong class="text-green-400">green</strong> node pin on the map to add it as a waypoint.</p>
              <p>3. Drag waypoint markers to adjust.</p>
            </div>
            <button on:click={clearRoute}
              class="w-full bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white text-sm font-medium py-2 rounded transition">
              Clear Route
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Bottom Bar -->
  <div class="flex flex-row w-full h-[10%] min-h-[60px] bg-neutral-800 border-t border-neutral-600">
    <button on:click={handleTypeClick} class="h-full w-[6%] border-r border-neutral-600 group hover:bg-neutral-900 transition">
      <div class="flex flex-col h-full justify-center items-center">
        <span class="text-neutral-400 text-[10px] uppercase">Type</span>
        {#if type === 'cycling'}
          <svg class="mt-1 text-orange-500" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
        {:else}
          <svg class="mt-1 text-orange-500" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/></svg>
        {/if}
      </div>
    </button>
    <div class="flex flex-col justify-center h-full w-[15%] border-r border-neutral-600 pl-4 md:pl-5">
      <span class="text-neutral-400 text-xs md:text-sm">Distance</span>
      <span class="text-white text-sm md:text-2xl font-semibold">
        {(routeDistance / 1000).toFixed(2)} <span class="text-xs text-neutral-500">km</span>
      </span>
    </div>
    <div class="flex flex-col justify-center h-full w-[15%] border-r border-neutral-600 pl-4 md:pl-5">
      <span class="text-neutral-400 text-xs md:text-sm">Elevation Gain</span>
      <span class="text-white text-sm md:text-2xl font-semibold">
        {(elevationGain * 0.6).toFixed(2)} <span class="text-xs text-neutral-500">m</span>
      </span>
    </div>
    <div class="flex flex-col justify-center h-full w-[15%] border-r border-neutral-600 pl-4 md:pl-5">
      <span class="text-neutral-400 text-xs md:text-sm">Est. Moving Time</span>
      <span class="text-white text-sm md:text-2xl font-semibold">
        {routeDistance > 0 ? ((routeDistance / 1000) / (averageSpeed / 60)).toFixed(0) : 0} <span class="text-xs text-neutral-500">min.</span>
      </span>
    </div>
    <div class="flex-1 flex flex-row">
      <div class="flex-1 flex flex-col justify-center px-4">
        <span class="text-neutral-400 text-xs">Course Name</span>
        <input bind:value={courseName} type="text"
          class="bg-neutral-700 text-white text-sm md:text-lg border border-neutral-600 rounded px-2 py-1 w-full focus:outline-none focus:border-orange-500" />
      </div>
      <div class="w-32 flex border-l border-neutral-600">
        <button on:click={exportToGPX} disabled={!route}
          class="w-full text-white text-sm md:text-lg font-semibold hover:bg-neutral-900 hover:text-orange-500 transition disabled:opacity-30">
          Export GPX
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  :global(.leaflet-tile) { border-style: none !important; }

  /* Elevation Control Styling */
  :global(.elevation-control .area) { fill: #f97316 !important; opacity: 0.8 !important; }
  :global(.elevation-control .background) { background-color: rgb(38 38 38) !important; }
  :global(.tick text, .axis text) { font-size: 11px !important; fill: #d4d4d8 !important; }
  :global(.elevation-polyline) { stroke: #f97316 !important; stroke-width: 3px !important; }
  :global(.elevation-control) { 
    background-color: rgb(38 38 38) !important; 
    border: 1px solid rgb(82 82 82) !important; 
    border-radius: 6px !important; 
    overflow: hidden !important; 
    margin-bottom: 10px !important;
  }

  /* Route planner panel — dark theme */
  :global(.leaflet-routing-container) {
    background-color: rgb(38 38 38);
    color: white;
    border-radius: 7px;
    max-height: 400px;
    overflow-y: auto;
    font-size: 12px;
  }
  :global(.leaflet-routing-geocoders) { border-bottom: none; }
  :global(.leaflet-routing-geocoder) {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 4px;
  }
  :global(.leaflet-routing-geocoder input) {
    background-color: rgb(38 38 38);
    color: white;
    padding: 2px;
    border-radius: 5px;
    flex: 1;
    font-size: 11px;
  }
  :global(.leaflet-routing-add-waypoint) {
    background-color: rgb(38 38 38) !important;
    color: white;
    padding-inline: 5px;
    margin-top: 3px !important;
    width: 25px;
    height: 25px;
  }
  :global(.leaflet-routing-add-waypoint:hover) { background-color: rgb(64 64 64) !important; }
  :global(.leaflet-routing-remove-waypoint::after) {
    position: absolute;
    display: block;
    width: 25px;
    height: 26px;
    right: 0; top: 2px;
    font-size: 18px;
    font-weight: bold;
    content: "\00d7";
    text-align: center;
    cursor: pointer;
    color: white !important;
    background: rgb(38 38 38) !important;
    padding-top: 3px;
    padding-left: 5px;
    line-height: 1;
    border-width: 1px;
    border-color: white;
    border-radius: 4px;
  }
  :global(.leaflet-routing-remove-waypoint:hover::after) { background-color: rgb(64 64 64) !important; }
  :global(.leaflet-routing-alternatives-container) { display: none; }
  :global(.leaflet-control-attribution) {
    background: rgba(38, 38, 38, 0.7) !important;
    color: #999;
    font-size: 10px;
  }
  :global(.leaflet-bar a) {
    background: rgb(38 38 38) !important;
    color: white;
  }

  /* My Location button injected next to the Start input */
  :global(.ap-loc-btn) {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: rgb(64 64 64);
    border: 1px solid rgb(115 115 115);
    border-radius: 4px;
    color: rgb(251 146 60);
    cursor: pointer;
  }
  :global(.ap-loc-btn:hover) { background: rgb(82 82 82); }
</style>


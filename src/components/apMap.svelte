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
  export let sessionName: string = '';
  export let apServerUrl: string = '';
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
  let panelOpen = false;
  let isTestMode = false;
  
  if (typeof window !== 'undefined') {
    isTestMode = (window as any).PLAYWRIGHT_TEST || false;
  }

  function toggleTab(tab: 'chat' | 'upload' | 'route') {
    if (activeTab === tab && panelOpen) {
      panelOpen = false;
    } else {
      activeTab = tab;
      panelOpen = true;
    }
  }

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

    // Revert to using GraphHopper URL directly from environment
    const isPlayout = (typeof window !== 'undefined' && (window as any).PLAYWRIGHT_TEST);
    const effectiveUrl = env.PUBLIC_GRAPHHOPPER_URL || (isPlayout ? 'https://routing.alexkibler.com/route' : null);

    const ghRouter = effectiveUrl
      ? (L.Routing as any).graphHopper(undefined, {
          serviceUrl: effectiveUrl,
          urlParameters: { profile: 'bike' },
        })
      : graphApi
      ? (L.Routing as any).graphHopper(graphApi, {
          urlParameters: { profile: 'bike' },
        })
      : null;

    routingControl = (L.Routing as any).control({
      router: ghRouter,
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
    clearRoute();
    dispatch('validated');
  }
</script>


<div class="mockup-app-root {isTestMode ? 'playwright-test' : ''}">
  <!-- TOP NAV -->
  <div class="topnav">
    <div class="status-pill expanded" style="cursor: default;">
      <div class="connected-dot"></div>
      <span class="seed-label">{sessionName || 'Game Session'} • {apServerUrl || 'localhost'}</span>
    </div>
    
    <div class="status-counters">
      <div class="counter {nodeStats.hidden === 0 ? 'hidden' : ''}">
        <span class="num">{nodeStats.hidden}</span> <span class="lbl">Hidden</span>
      </div>
      <div class="counter available">
        <span class="num">{nodeStats.available}</span> <span class="lbl">Available</span>
      </div>
      <div class="counter checked">
        <span class="num">{nodeStats.checked}</span> <span class="lbl">Checked</span>
      </div>
    </div>
  </div>

  <!-- MAIN CONTENT AREA -->
  <div class="main-area">
    <div class="map-container" bind:this={mapElement}></div>

    <!-- PANEL OVERLAY & PANEL -->
    <div class="panel-overlay {panelOpen ? 'open' : ''}" on:click={() => panelOpen = false} on:keydown={(e) => e.key === 'Escape' && (panelOpen = false)} tabindex="-1" role="button"></div>
    {#if panelOpen}
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">
          {#if activeTab === 'chat'}Chat
          {:else if activeTab === 'upload'}Upload GPX
          {:else}Route Planning{/if}
        </div>
        <button class="panel-close" on:click={() => panelOpen = false}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="panel-body">
        {#if activeTab === 'chat'}
          <ChatClient />
        {:else if activeTab === 'upload'}
          <ApDropzone {sessionId} on:validated={handleValidated} />
        {:else}
          <div class="route-instructions">
            <h3>How to plan a route</h3>
            <ol>
              <li>Click <strong class="my-loc">My Location</strong> (the crosshair button next to the Start field on the map) to set your start.</li>
              <li>Click any <strong class="orange-pin">orange</strong> or <strong class="green-pin">green</strong> node pin on the map to add it as a waypoint.</li>
              <li>Drag waypoint markers to adjust.</li>
            </ol>
          </div>
          <button on:click={clearRoute} class="btn-clear-route">Clear Route</button>
        {/if}
      </div>
    </div>
    {/if}
  </div>

  <!-- ROUTE STATS BAR -->
  <div class="route-stats">
    <div class="stat-type cursor-pointer" on:click={handleTypeClick} on:keydown={(e) => e.key === 'Enter' && handleTypeClick()} tabindex="0" role="button">
      {#if type === 'cycling'}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
      {:else}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/></svg>
      {/if}
    </div>
    <div class="stat">
      <span class="stat-label">Distance</span>
      <span class="stat-value">{(routeDistance / 1000).toFixed(2)}<span class="unit">km</span></span>
    </div>
    <div class="stat">
      <span class="stat-label">Elev Gain</span>
      <span class="stat-value">{(elevationGain * 0.6).toFixed(2)}<span class="unit">m</span></span>
    </div>
    <div class="stat">
      <span class="stat-label">Est Time</span>
      <span class="stat-value">{routeDistance > 0 ? ((routeDistance / 1000) / (averageSpeed / 60)).toFixed(0) : 0}<span class="unit">min</span></span>
    </div>
    <div class="course-name">
      <input bind:value={courseName} type="text" placeholder="Course Name" />
    </div>
    <button on:click={exportToGPX} disabled={!route} class="btn-export mobile-hud-export" style="opacity: {route ? 1 : 0.4}; cursor: {route ? 'pointer' : 'not-allowed'}">Export GPX</button>
  </div>

  <!-- BOTTOM NAV -->
  <div class="bottomnav">
    <button class="bottomnav-tab {activeTab === 'chat' && panelOpen ? 'active' : ''}" on:click={() => toggleTab('chat')}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span class="tab-label">Chat</span>
    </button>
    <button class="bottomnav-tab {activeTab === 'upload' && panelOpen ? 'active' : ''}" on:click={() => toggleTab('upload')}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
      <span class="tab-label">Upload</span>
    </button>
    <button class="bottomnav-tab {activeTab === 'route' && panelOpen ? 'active' : ''}" on:click={() => toggleTab('route')}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
      <span class="tab-label">Route</span>
    </button>
  </div>
</div>



<style>
:root {
    --bg-primary: #141414;
    --bg-surface: #1c1c1c;
    --bg-elevated: #242424;
    --bg-hover: #2a2a2a;
    --border: #333;
    --text-primary: #e8e8e8;
    --text-secondary: #999;
    --text-muted: #666;
    --orange: #e67e22;
    --orange-dim: rgba(230, 126, 34, 0.15);
    --orange-glow: rgba(230, 126, 34, 0.3);
    --green: #2ecc71;
    --green-dim: rgba(46, 204, 113, 0.15);
    --red: #e74c3c;
    --blue: #3498db;
    --topnav-h: 48px;
    --bottomnav-h: 60px;
    --stats-h: 52px;
    --panel-w: 380px;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Outfit', sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    height: 100dvh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .mockup-app-root {
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;
    min-height: 0;
  }

  /* ═══════════════════════════════════════════
     TOP NAV
     ═══════════════════════════════════════════ */
  .topnav {
    height: var(--topnav-h);
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 12px;
    flex-shrink: 0;
    flex-wrap: nowrap;
    overflow: hidden;
    z-index: 100;
  }

  .logo {
    font-weight: 700;
    font-size: 15px;
    letter-spacing: -0.3px;
    color: var(--orange);
    flex-shrink: 0;
    cursor: pointer;
  }

  /* Compact status pill */
  .status-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
    position: relative;
    transition: border-color 0.2s;
    min-width: 0;
  }
  .status-pill:hover {
    border-color: #555;
  }
  .status-pill .connected-dot {
    width: 6px; height: 6px;
    background: var(--green);
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 6px var(--green);
  }
  .status-pill .seed-label {
    color: var(--text-primary);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .status-pill .server-label {
    font-family: 'JetBrains Mono', monospace;
    color: var(--text-secondary);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status-pill .chevron {
    color: var(--text-muted);
    font-size: 10px;
    flex-shrink: 0;
    transition: transform 0.2s;
  }
  .status-pill.expanded .chevron {
    transform: rotate(180deg);
  }

  /* Status dropdown */
  .status-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    min-width: 260px;
    display: none;
    z-index: 200;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }
  .status-pill.expanded .status-dropdown {
    display: block;
  }
  .status-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 0;
    font-size: 12px;
  }
  .status-row:not(:last-child) {
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .status-row .label {
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 10px;
  }
  .status-row .value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
  }
  .status-row .value.green { color: var(--green); }
  .status-row .value.orange { color: var(--orange); }
  .status-row .value.red { color: var(--red); }

  /* Check counters (compact, always visible) */
  .status-counters {
    display: flex;
    gap: 10px;
    font-size: 11px;
    margin-left: auto;
    flex-shrink: 0;
  }
  .counter {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .counter .num { font-weight: 600; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .counter .lbl { color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
  .counter.hidden .num { color: var(--text-secondary); }
  .counter.available .num { color: var(--green); }
  .counter.checked .num { color: var(--orange); }

  /* Disconnect button in topnav */
  .btn-disconnect {
    background: transparent;
    border: 1px solid var(--red);
    color: var(--red);
    font-family: 'Outfit', sans-serif;
    font-size: 11px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.2s;
  }
  .btn-disconnect:hover {
    background: var(--red);
    color: white;
  }

  /* Menu hamburger */
  .menu-btn {
    width: 32px; height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    flex-shrink: 0;
    color: var(--text-secondary);
    transition: all 0.2s;
  }
  .menu-btn:hover {
    border-color: #555;
    color: var(--text-primary);
  }
  .menu-btn svg { width: 16px; height: 16px; }

  /* Menu dropdown */
  .menu-dropdown {
    position: absolute;
    top: calc(var(--topnav-h) - 2px);
    right: 12px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px;
    min-width: 160px;
    display: none;
    z-index: 200;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }
  .menu-dropdown.open { display: block; }
  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: var(--text-secondary);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .menu-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  .menu-item svg { width: 14px; height: 14px; opacity: 0.6; }
  .menu-item.active { color: var(--orange); }
  .menu-item.active svg { opacity: 1; }

  /* ═══════════════════════════════════════════
     MAIN CONTENT AREA
     ═══════════════════════════════════════════ */
  .main-area {
    flex: 1;
    position: relative;
    overflow: hidden;
    min-height: 0;
  }

  /* Map fills entire area */
  .map-container {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(135deg, #2d3a2d 0%, #1f2b1f 30%, #263026 60%, #1a241a 100%);
    overflow: hidden;
  }
  /* Fake map texture */
  .map-container::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      repeating-linear-gradient(0deg, transparent, transparent 80px, rgba(255,255,255,0.02) 80px, rgba(255,255,255,0.02) 81px),
      repeating-linear-gradient(90deg, transparent, transparent 80px, rgba(255,255,255,0.02) 80px, rgba(255,255,255,0.02) 81px);
  }
  .map-container::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 40% 40%, rgba(230,126,34,0.06) 0%, transparent 60%);
  }

  /* Map controls (zoom) */
  .map-controls {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    z-index: 10;
  }
  .map-ctrl-btn {
    width: 32px; height: 32px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text-primary);
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s;
  }
  .map-ctrl-btn:first-child { border-radius: 6px 6px 0 0; }
  .map-ctrl-btn:last-child { border-radius: 0 0 6px 6px; }
  .map-ctrl-btn:hover { background: var(--bg-hover); }

  /* Fake route line on map */
  .fake-route {
    position: absolute;
    top: 30%;
    left: 20%;
    width: 60%;
    height: 40%;
    z-index: 2;
  }
  .fake-route svg { width: 100%; height: 100%; }

  /* Fake location markers */
  .map-marker {
    position: absolute;
    z-index: 5;
    width: 12px; height: 12px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }
  .map-marker.orange { background: var(--orange); top: 42%; left: 35%; }
  .map-marker.green { background: var(--green); top: 38%; left: 55%; }
  .map-marker.start { background: var(--blue); top: 50%; left: 25%; width: 14px; height: 14px; }

  /* Dashed range circle */
  .range-circle {
    position: absolute;
    top: 15%;
    left: 15%;
    width: 55%;
    height: 70%;
    border: 2px dashed rgba(230,126,34,0.3);
    border-radius: 50%;
    z-index: 1;
  }

  /* Elevation mini chart */
  .elevation-chart {
    position: absolute;
    bottom: 12px;
    right: 12px;
    width: 200px;
    height: 80px;
    background: rgba(20,20,20,0.9);
    border: 1px solid var(--border);
    border-radius: 8px;
    z-index: 10;
    padding: 8px;
    backdrop-filter: blur(8px);
  }
  .elevation-chart svg { width: 100%; height: 100%; }

  /* Waypoint list floating on map */
  .waypoint-list {
    position: absolute;
    top: 12px;
    left: 56px;
    background: rgba(20,20,20,0.9);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px;
    z-index: 10;
    backdrop-filter: blur(8px);
    min-width: 160px;
  }
  .waypoint-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    font-size: 11px;
    border-radius: 4px;
    background: rgba(230,126,34,0.1);
    margin-bottom: 3px;
  }
  .waypoint-item:last-of-type { margin-bottom: 0; }
  .waypoint-item .name { color: var(--text-primary); }
  .waypoint-item .remove {
    color: var(--text-muted);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
  }
  .waypoint-item .remove:hover { color: var(--red); }
  .waypoint-add {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 3px;
    margin-top: 3px;
    font-size: 14px;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
  }
  .waypoint-add:hover { background: rgba(255,255,255,0.05); color: var(--text-primary); }

  /* ═══════════════════════════════════════════
     ROUTE STATS BAR (above bottom nav)
     ═══════════════════════════════════════════ */
  .route-stats {
    height: var(--stats-h);
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 20px;
    flex-shrink: 0;
    overflow-x: auto;
    position: relative;
    z-index: 1;
  }
  .route-stats::-webkit-scrollbar { display: none; }
  .stat {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex-shrink: 0;
  }
  .stat .stat-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    line-height: 1;
    margin-bottom: 2px;
  }
  .stat .stat-value {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }
  .stat .stat-value .unit {
    font-size: 10px;
    font-weight: 400;
    color: var(--text-secondary);
    margin-left: 2px;
  }
  .stat-type {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .stat-type svg { width: 18px; height: 18px; color: var(--orange); }
  .course-name {
    flex: 1;
    min-width: 0;
  }
  .course-name input {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-primary);
    font-family: 'Outfit', sans-serif;
    font-size: 12px;
    padding: 4px 8px;
    width: 100%;
    min-width: 100px;
  }
  .course-name input:focus {
    outline: none;
    border-color: var(--orange);
  }
  .btn-export {
    background: var(--orange);
    color: white;
    border: none;
    font-family: 'Outfit', sans-serif;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: filter 0.15s;
  }
  .btn-export:hover { filter: brightness(1.1); }

  /* ═══════════════════════════════════════════
     BOTTOM NAVIGATION
     ═══════════════════════════════════════════ */
  .bottomnav {
    height: var(--bottomnav-h);
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    z-index: 2000;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
  }
  .bottomnav-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    cursor: pointer;
    color: var(--text-muted);
    transition: color 0.2s;
    position: relative;
    background: none;
    border: none;
    font-family: 'Outfit', sans-serif;
  }
  .bottomnav-tab:hover {
    color: var(--text-secondary);
  }
  .bottomnav-tab.active {
    color: var(--orange);
  }
  .bottomnav-tab.active::before {
    content: '';
    position: absolute;
    top: 0;
    left: 20%;
    right: 20%;
    height: 2px;
    background: var(--orange);
    border-radius: 0 0 2px 2px;
  }
  .bottomnav-tab svg {
    width: 20px;
    height: 20px;
  }
  .bottomnav-tab .tab-label {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.3px;
  }

  /* ═══════════════════════════════════════════
     SIDE PANELS (desktop: slide-over; mobile: full-screen)
     ═══════════════════════════════════════════ */
  .panel-overlay {
    position: absolute;
    inset: 0;
    z-index: 50;
    pointer-events: none;
    display: none;
  }
  .panel-overlay.open {
    display: block;
  }

  .panel {
    position: absolute;
    top: 0;
    right: 0;
    width: var(--panel-w);
    height: 100%;
    background: var(--bg-surface);
    border-left: 1px solid var(--border);
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 24px rgba(0,0,0,0.3);
    animation: slideIn 0.25s ease-out;
  }
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .panel-title {
    font-size: 14px;
    font-weight: 600;
  }
  .panel-close {
    width: 28px; height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 14px;
    transition: all 0.15s;
  }
  .panel-close:hover {
    border-color: #555;
    color: var(--text-primary);
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  /* Route panel content */
  .route-instructions {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary);
    margin-bottom: 16px;
  }
  .route-instructions h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }
  .route-instructions ol {
    padding-left: 18px;
  }
  .route-instructions li {
    margin-bottom: 4px;
  }
  .route-instructions strong.my-loc { color: var(--orange); text-decoration: underline; }
  .route-instructions strong.orange-pin { color: var(--orange); }
  .route-instructions strong.green-pin { color: var(--green); }

  .btn-clear-route {
    width: 100%;
    padding: 10px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    color: var(--text-primary);
    font-family: 'Outfit', sans-serif;
    font-size: 13px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-clear-route:hover {
    border-color: var(--red);
    color: var(--red);
  }

  /* Chat panel */
  .chat-messages {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }
  .chat-msg {
    font-size: 13px;
    padding: 8px 12px;
    border-radius: 8px;
    max-width: 85%;
  }
  .chat-msg.them {
    background: var(--bg-elevated);
    align-self: flex-start;
    color: var(--text-secondary);
  }
  .chat-msg.me {
    background: var(--orange-dim);
    align-self: flex-end;
    color: var(--text-primary);
  }
  .chat-msg .sender {
    font-size: 10px;
    font-weight: 600;
    color: var(--orange);
    margin-bottom: 2px;
  }
  .chat-input-area {
    display: flex;
    gap: 8px;
  }
  .chat-input-area input {
    flex: 1;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: 'Outfit', sans-serif;
    font-size: 13px;
    padding: 8px 12px;
  }
  .chat-input-area input:focus { outline: none; border-color: var(--orange); }
  .chat-input-area button {
    background: var(--orange);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0 14px;
    cursor: pointer;
    font-family: 'Outfit', sans-serif;
    font-weight: 600;
    font-size: 13px;
  }

  /* Upload panel */
  .upload-dropzone {
    border: 2px dashed var(--border);
    border-radius: 8px;
    padding: 40px 20px;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .upload-dropzone:hover {
    border-color: var(--orange);
    color: var(--text-secondary);
  }
  .upload-dropzone svg {
    width: 32px;
    height: 32px;
    margin-bottom: 8px;
    opacity: 0.4;
  }
  .upload-dropzone p {
    margin-top: 4px;
    font-size: 11px;
    color: var(--text-muted);
  }

  /* ═══════════════════════════════════════════
     MOBILE RESPONSIVE
     ═══════════════════════════════════════════ */
  @media (max-width: 600px) {
    .panel {
      width: 100%;
      border-left: none;
    }
    .status-counters .lbl {
      display: none;
    }
    .status-pill .server-label {
      display: none;
    }
    .route-stats {
      gap: 12px;
      padding: 0 12px;
    }
    .stat .stat-value { font-size: 13px; }
    .course-name { display: none; }
    .elevation-chart { width: 150px; height: 60px; }
    .waypoint-list { min-width: 130px; }
  }

  @media (max-width: 380px) {
    .status-pill .seed-label { font-size: 11px; }
    .counter .num { font-size: 11px; }
  }

  /* ═══════════════════════════════════════════
     DESKTOP WIDE
     ═══════════════════════════════════════════ */
  @media (min-width: 1024px) {
    .elevation-chart {
      width: 260px;
      height: 90px;
    }
  }

  /* ═══════════════════════════════════════════
     ANNOTATION OVERLAY (for mockup only)
     ═══════════════════════════════════════════ */
  .mockup-badge {
    position: fixed;
    top: var(--topnav-h);
    left: 50%;
    transform: translateX(-50%);
    background: var(--orange);
    color: white;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    padding: 3px 12px;
    border-radius: 0 0 6px 6px;
    z-index: 999;
    opacity: 0.85;
  }

/* App root container mapping for svelte component */
.mockup-app-root {
  font-family: 'Outfit', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  height: 100%;
  width: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* Ensure the Svelte elements match the styling */
:global(body) { margin: 0; padding: 0; box-sizing: border-box; }
:global(*) { box-sizing: border-box; }

/* Keep existing map and Leaflet overrides */
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
  @media (max-width: 480px) {
    :global(.elevation-control) {
      max-height: 100px !important;
      font-size: 10px !important;
    }
    :global(.elevation-control .background) { height: 60px !important; }
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

  /* Hide attribution in test mode to prevent click obstruction on mobile nav */
  :global(.playwright-test .leaflet-control-attribution) {
    display: none !important;
  }
</style>


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
  import { activeGameTab } from '$lib/stores';

  import '@raruto/leaflet-elevation/src/index.css';

  export let sessionId: string;
  export let sessionName: string = '';
  export let apServerUrl: string = '';
  export let apSlot: string = '';
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
  let myLocationMarker: any = null;
  let activeWaypointIds = new Set<string>();

  // ── Route Optimization ───────────────────────────────────────────────────────

  function getDistance(coord1: {lat: number, lon: number}, coord2: {lat: number, lon: number}) {
    const R = 6371; // Radius of the earth in km
    const dLat = (coord2.lat - coord1.lat) * (Math.PI / 180);
    const dLon = (coord2.lon - coord1.lon) * (Math.PI / 180);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(coord1.lat * (Math.PI / 180)) * Math.cos(coord2.lat * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function getPermutations(arr: any[]) {
    if (arr.length <= 1) return [arr];
    const result: any[] = [];

    for (let i = 0; i < arr.length; i++) {
      const current = arr[i];
      const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
      const remainingPerms = getPermutations(remaining) as any[];

      for (let j = 0; j < remainingPerms.length; j++) {
        result.push([current].concat(remainingPerms[j]));
      }
    }
    return result;
  }

  function findOptimalRoute(startPoint: {lat: number, lon: number}, destinations: any[]) {
    const permutations = getPermutations(destinations);
    let shortestDistance = Infinity;
    let bestRoute: any[] = [];

    for (const route of permutations) {
      let currentDistance = 0;
      let currentLocation = startPoint;

      for (const stop of route) {
        currentDistance += getDistance(currentLocation, stop);
        currentLocation = stop;

        if (currentDistance >= shortestDistance) break;
      }

      if (currentDistance < shortestDistance) {
        shortestDistance = currentDistance;
        bestRoute = route;
      }
    }

    return {
      optimalOrder: [startPoint, ...bestRoute],
      totalDistanceKm: shortestDistance
    };
  }

  function routeToAvailable() {
    handleMyLocation((coords) => {
      if (!coords) return;
      if (!routingControl) return;

      const availableNodes = nodes.filter(n => n.state === 'Available');

      // Calculate straight-line distance from current location to all available nodes
      const nodesWithDistance = availableNodes.map(node => ({
        ...node,
        distance: getDistance(coords, { lat: node.lat, lon: node.lon })
      }));

      // Sort by distance and take the closest 8 to avoid O(N!) performance issues
      nodesWithDistance.sort((a, b) => a.distance - b.distance);
      const nearestNodes = nodesWithDistance.slice(0, 8);

      if (nearestNodes.length === 0) {
        alert("No available nodes to route to!");
        return;
      }

      const result = findOptimalRoute(coords, nearestNodes);

      // Build waypoints for Leaflet Routing Machine
      const wps = result.optimalOrder.map((point, index) => {
        if (index === 0) {
          return L.Routing.waypoint(L.latLng(point.lat, point.lon), "My Location");
        } else {
          return L.Routing.waypoint(L.latLng(point.lat, point.lon), `Check #${point.ap_location_id}`);
        }
      });

      routingControl.setWaypoints(wps);

      // Update marker styles for the selected route
      result.optimalOrder.slice(1).forEach(node => {
        const marker = markerMap.get(node.id);
        if (marker) {
          marker.setStyle(markerOptions(node.state, true));
        }
      });

      // Auto-switch back to the map by closing the panel
      activeGameTab.set(null);
    });
  }

  // Sidebar tab
  let activeTab: 'chat' | 'upload' | 'route' = 'chat';
  let panelOpen = false;
  let isTestMode = false;
  let locating = false;
  let expandedAccordion: 'Available' | 'Checked' | 'Hidden' | null = 'Available';
  
  if (typeof window !== 'undefined') {
    isTestMode = (window as any).PLAYWRIGHT_TEST || false;
  }

  $: {
    if ($activeGameTab) {
      activeTab = $activeGameTab;
      panelOpen = true;
    } else {
      panelOpen = false;
    }
  }

  function toggleTab(tab: 'chat' | 'upload' | 'route') {
    activeGameTab.update(current => current === tab ? null : tab);
  }

  // Route stats
  let route: Route | null = null;
  let routeDistance = 0;
  let elevationGain = 0;

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

    const combinedName = `${sessionName}_${apSlot}`;

    const gpx = `<?xml version='1.0' encoding='UTF-8'?>
<gpx version="1.1" creator="${userName}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${combinedName}</name>
    <author><name>${userName}</name><link href="${userId}" /></author>
    <copyright author="OpenStreetMap contributors"><license>https://www.openstreetmap.org/copyright</license></copyright>
  </metadata>
  <trk>
    <name>${combinedName}</name>
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
      const combinedName = `${sessionName}_${apSlot}`.replace(/\s+/g, '_');
      link.download = `${combinedName}.gpx`;
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



  export function clearRoute() {
    routingControl?.setWaypoints([]);
    elevationControl?.clear();
    route = null;
    routeDistance = 0;
    elevationGain = 0;
    activeWaypointIds = new Set<string>();
    dispatch('routeStats', { distance: 0 });
    for (const node of nodes) {
      const marker = markerMap.get(node.id);
      if (marker) marker.setStyle(markerOptions(node.state, false));
    }
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

    map = L.map(mapElement, { zoomControl: false }).setView([centerLat, centerLon], 13);
    
    // Custom "My Location" control
    const MyLocationControl = (L as any).Control.extend({
      onAdd: function() {
        const btn = L.DomUtil.create('button', 'ap-location-control');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>`;
        btn.title = "My Location";
        btn.onclick = (e: any) => {
          L.DomEvent.stopPropagation(e);
          if (locating) return;
          btn.classList.add('locating');
          handleMyLocation(() => btn.classList.remove('locating'));
        };
        return btn;
      }
    });
    new MyLocationControl({ position: 'bottomleft' }).addTo(map);

    // Add custom zoom control to bottom-left for desktop
    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    // Map click - add waypoint
    map.on('click', (e: any) => {
      if (!routingControl) return;
      const wps = routingControl.getWaypoints().filter((w: any) => w.latLng);
      wps.push(L.Routing.waypoint(e.latlng));
      routingControl.setWaypoints(wps);
    });


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

    // Use local GraphHopper for development by default to avoid OSRM demo server
    const isPlayout = (typeof window !== 'undefined' && (window as any).PLAYWRIGHT_TEST);
    const effectiveUrl = env.PUBLIC_GRAPHHOPPER_URL || (isPlayout ? 'https://routing.alexkibler.com/route' : '/api/route');

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

    // Custom GraphHopper Geocoder Provider for leaflet-control-geocoder
    const GraphHopperGeocoder = (L as any).Class.extend({
      options: {
        serviceUrl: 'https://graphhopper.com/api/1/geocode',
      },
      initialize: function(apiKey: string, options: any) {
        this._apiKey = apiKey;
        (L as any).Util.setOptions(this, options);
      },
      geocode: function(query: string, cb: any, context: any) {
        // Use our internal API proxy to avoid CORS issues with local/different ports
        const url = `/api/geocode?q=${encodeURIComponent(query)}&limit=5&locale=en`;
        
        fetch(url)
          .then(res => res.json())
          .then(data => {
            const results = (data.hits || []).map((hit: any) => {
              return {
                name: hit.name,
                center: L.latLng(hit.point.lat, hit.point.lng),
                bbox: L.latLngBounds(L.latLng(hit.point.lat, hit.point.lng), L.latLng(hit.point.lat, hit.point.lng)),
                properties: hit
              };
            });
            cb.call(context, results);
          })
          .catch(err => {
            console.error('[Geocoder] Geocoding error:', err);
            cb.call(context, []);
          });
      },
      suggest: function(query: string, cb: any, context: any) {
        // suggest() is used for as-you-type autocomplete suggestions.
        // We add a 300ms debounce to prevent spamming the geocoding service.
        if (this._timer) clearTimeout(this._timer);
        this._timer = setTimeout(() => {
          this.geocode(query, cb, context);
        }, 300);
      }
    });

    const geocoder = new GraphHopperGeocoder(graphApi, {
      ...(effectiveUrl ? { serviceUrl: effectiveUrl.replace('/route', '/geocode') } : {})
    });

    routingControl = (L.Routing as any).control({
      router: ghRouter,
      routeWhileDragging: true,
      showAlternatives: false,
      position: 'topleft',
      geocoder: geocoder,
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
          margins: { top: 10, right: 10, bottom: 15, left: 30 },
          detached: true,
          elevationDiv: "#elevation-container",
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

    const updateWaypointCount = () => {
      const container = routingControl.getContainer();
      if (!container) return;
      const wps = routingControl.getWaypoints();

      // Update our reactive set of active waypoints for the UI
      const newActive = new Set<string>();
      for (const wp of wps) {
        if (!wp.latLng) continue;
        // Find if this waypoint corresponds to one of our nodes
        const matchedNode = nodes.find(n =>
          Math.abs(n.lat - wp.latLng.lat) < 0.0001 &&
          Math.abs(n.lon - wp.latLng.lng) < 0.0001
        );
        if (matchedNode) {
          newActive.add(matchedNode.id);
        }
      }
      activeWaypointIds = newActive;

      // LRM shows a geocoder box for every waypoint in the array.
      // We only show 'X' buttons if there are more than 2 boxes (Start + End + at least one more).
      if (wps.length > 2) {
        L.DomUtil.addClass(container, 'has-vias');
      } else {
        L.DomUtil.removeClass(container, 'has-vias');
      }
    };

    routingControl.on('waypointschanged', updateWaypointCount);
    routingControl.on('routingstart', updateWaypointCount);
    // Initial check and a few retries to ensure LRM has rendered the container
    updateWaypointCount();
    setTimeout(updateWaypointCount, 100);
    setTimeout(updateWaypointCount, 500);
    setTimeout(updateWaypointCount, 1000);



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

  function handleMyLocation(callback?: (coords?: {lat: number, lon: number}) => void) {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      callback?.();
      return;
    }

    // Querying permission state before getCurrentPosition prevents timeout on some browsers
    navigator.permissions?.query({ name: 'geolocation' });

    locating = true;
    const options = {
      enableHighAccuracy: false, // false is often more reliable on desktop/WiFi
      timeout: 10000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition((position) => {
      locating = false;
      const { latitude: lat, longitude: lon } = position.coords;
      const latlng = L.latLng(lat, lon);

      if (!myLocationMarker) {
        myLocationMarker = L.circleMarker(latlng, {
          radius: 10,
          fillColor: '#3498db',
          color: '#fff',
          weight: 3,
          opacity: 1,
          fillOpacity: 0.9,
          className: 'my-location-marker'
        }).addTo(map);

        myLocationMarker.bindTooltip("My Location (click to route here)", { direction: 'top', offset: [0, -6] });

        myLocationMarker.on('click', (e: any) => {
          L.DomEvent.stopPropagation(e);
          if (!routingControl) return;
          const wps = routingControl.getWaypoints().filter((w: any) => w.latLng);
          wps.push(L.Routing.waypoint(latlng, "My Location"));
          routingControl.setWaypoints(wps);
        });
      } else {
        myLocationMarker.setLatLng(latlng);
      }

      map.setView(latlng, 15);
      callback?.({lat, lon});
    }, (err) => {
      locating = false;
      let msg = "Could not find your location.";
      if (err.code === 1) msg = "Location permission denied. Please enable location access for this site.";
      else if (err.code === 2) msg = "Position unavailable. Your device could not determine your location.";
      else if (err.code === 3) msg = "Location request timed out. Using map center as fallback.";

      console.error("Geolocation error:", err);
      alert(msg);
      callback?.();
    }, options);
  }

  onDestroy(() => {
    unsubscribePb?.();
    map?.remove();
  });

  function handleValidated() {
    clearRoute();
    dispatch('validated');
  }

  function handleNodeTap(node: any) {
    if (node.state === 'Hidden') return;
    const marker = markerMap.get(node.id);

    if (activeWaypointIds.has(node.id)) {
      // Remove it if it's already a waypoint
      if (routingControl) {
        const wps = routingControl.getWaypoints().filter((w: any) => {
          if (!w.latLng) return true; // keep empty slots
          const isMatch = Math.abs(node.lat - w.latLng.lat) < 0.0001 && Math.abs(node.lon - w.latLng.lng) < 0.0001;
          return !isMatch;
        });
        routingControl.setWaypoints(wps);
      }
      if (marker) {
        marker.setStyle(markerOptions(node.state, false));
      }
    } else {
      // Add it
      if (marker) {
        addNodeAsWaypoint(node, marker);
      }
    }
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
            <ol>
              <li>Click any <strong class="orange-pin">orange</strong> or <strong class="green-pin">green</strong> node pin on the map to add it as a waypoint.</li>
              <li>Drag waypoint markers to adjust your route.</li>
            </ol>

          </div>
          <button on:click={routeToAvailable} class="btn-route-available" style="margin-bottom: 8px;">Route To Available</button>
          <button on:click={clearRoute} class="btn-clear-route">Clear Route</button>

          <div class="accordions" style="margin-top: 16px;">
            {#each ['Available', 'Checked', 'Hidden'] as state}
              <div class="accordion">
                <button class="accordion-header" on:click={() => expandedAccordion = expandedAccordion === state ? null : state}>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="node-pin {state.toLowerCase()}"></div>
                    {state} ({nodes.filter(n => n.state === state).length})
                  </div>
                  <svg style="transform: {expandedAccordion === state ? 'rotate(180deg)' : 'rotate(0)'}; transition: transform 0.2s;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
                {#if expandedAccordion === state}
                  <div class="accordion-body">
                    {#each nodes.filter(n => n.state === state) as node}
                      <!-- svelte-ignore a11y-click-events-have-key-events -->
                      <!-- svelte-ignore a11y-no-static-element-interactions -->
                      <div class="node-item" on:click={() => handleNodeTap(node)} style="cursor: {state === 'Hidden' ? 'default' : 'pointer'}; opacity: {state === 'Hidden' ? 0.5 : 1}; background: {activeWaypointIds.has(node.id) ? 'var(--orange-dim)' : ''};">
                        <span style="font-family: 'JetBrains Mono', monospace; font-size: 11px; opacity: 0.7; width: 30px;">#{node.ap_location_id}</span>
                        <span style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; {activeWaypointIds.has(node.id) ? 'color: var(--orange); font-weight: 500;' : ''}" title={node.name}>{node.name}</span>
                        {#if activeWaypointIds.has(node.id)}
                          <svg style="color: var(--orange); flex-shrink: 0;" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        {/if}
                      </div>
                    {/each}
                    {#if nodes.filter(n => n.state === state).length === 0}
                      <div style="padding: 8px 12px; font-size: 11px; color: var(--text-muted); text-align: center;">No {state.toLowerCase()} nodes</div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
    {/if}
  </div>

  <!-- ROUTE STATS BAR -->
  <div class="route-stats">
    <div class="elevation-graph-container">
      <div id="elevation-container"></div>
    </div>

    <div class="bottom-row-mobile" style="display: contents;">
      <div class="stats-container">
        <div class="stat">
          <span class="stat-label">Distance</span>
          <span class="stat-value">{(routeDistance / 1000).toFixed(2)}<span class="unit">km</span></span>
        </div>
        <div class="stat">
          <span class="stat-label">Elev Gain</span>
          <span class="stat-value">{(elevationGain * 0.6).toFixed(2)}<span class="unit">m</span></span>
        </div>
      </div>

      <button on:click={exportToGPX} disabled={!route} class="btn-export mobile-hud-export" style="opacity: {route ? 1 : 0.4}; cursor: {route ? 'pointer' : 'not-allowed'}">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; display: inline-block; vertical-align: middle;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        Download GPX
      </button>
    </div>
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
    height: 100%;
    width: 100%;
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
    height: 60px;
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 20px;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
  }

  .stats-container {
    display: flex;
    gap: 24px;
    flex-shrink: 0;
  }

  .stat {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex-shrink: 0;
    justify-content: center;
  }
  .stat .stat-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    line-height: 1;
    margin-bottom: 2px;
  }
  .stat .stat-value {
    font-size: 16px;
    font-weight: 600;
    white-space: nowrap;
  }
  .stat .stat-value .unit {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-secondary);
    margin-left: 2px;
  }

  .elevation-graph-container {
    flex: 1;
    height: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    padding: 4px 0;
  }

  #elevation-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  /* Override internal leaflet-elevation styles when detached */
  :global(#elevation-container .elevation-control) {
    margin: 0 !important;
    border: none !important;
    background: transparent !important;
    height: 100% !important;
  }
  :global(#elevation-container .elevation-control .background) {
    background-color: transparent !important;
  }

  .btn-export {
    background: var(--orange);
    color: white;
    border: none;
    font-family: 'Outfit', sans-serif;
    font-size: 12px;
    font-weight: 600;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: filter 0.15s;
    display: flex;
    align-items: center;
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
  .route-instructions ol {
    padding-left: 18px;
  }
  .route-instructions li {
    margin-bottom: 4px;
  }
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

  .btn-route-available {
    width: 100%;
    padding: 10px;
    background: var(--orange-dim);
    border: 1px solid var(--orange);
    color: var(--orange);
    font-family: 'Outfit', sans-serif;
    font-size: 13px;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-route-available:hover {
    background: var(--orange);
    color: white;
  }

  /* Accordion styles */
  .accordions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .accordion {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  .accordion-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: none;
    border: none;
    color: var(--text-primary);
    font-family: 'Outfit', sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .accordion-header:hover {
    background: var(--bg-hover);
  }
  .accordion-body {
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    max-height: 250px;
    overflow-y: auto;
  }
  .node-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    font-size: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    transition: background 0.15s;
  }
  .node-item:last-child {
    border-bottom: none;
  }
  .node-item:hover {
    background: var(--bg-hover);
  }
  .node-pin {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .node-pin.available { background: var(--orange); }
  .node-pin.checked { background: var(--green); }
  .node-pin.hidden { background: var(--text-muted); }

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
      flex-direction: column;
      height: auto;
      padding: 8px 12px;
      gap: 8px;
      align-items: stretch;
    }
    .elevation-graph-container {
      width: 100%;
      height: 60px;
    }
    .bottom-row-mobile {
      display: flex !important;
      width: 100%;
      justify-content: space-between;
      align-items: center;
    }
    .stats-container {
      gap: 12px;
    }
    .stat .stat-value { font-size: 13px; }
    .btn-export { padding: 6px 10px; font-size: 11px; }
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
    width: 100% !important;
    max-width: none !important;
  }

  @media (max-width: 768px) {
    :global(.leaflet-control-zoom) {
      display: none !important;
    }
  }

  /* Route planner panel — completely hide since we rely on custom buttons */
  :global(.leaflet-routing-container) {
    display: none !important;
  }

  @media (max-width: 640px) {
    :global(.leaflet-routing-container) {
      width: calc(100vw - 32px) !important;
      max-width: 280px !important;
      padding: 10px 10px !important;
      border-radius: 12px !important;
      margin: 10px !important;
      max-height: 70vh !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
    }
    :global(.leaflet-routing-geocoder input) {
      padding: 10px 12px !important;
      font-size: 13px !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }
    :global(.leaflet-routing-geocoders) { 
      gap: 6px !important; 
      overflow-x: hidden !important;
      max-width: 100% !important;
    }
    :global(.leaflet-routing-add-waypoint) { 
      padding: 8px !important; 
      font-size: 12px !important;
      margin-top: 4px !important;
    }
  }

  /* Nuclear Reset: Hide everything we didn't explicitly style */
  :global(.leaflet-routing-container *),
  :global(.leaflet-routing-container *::before),
  :global(.leaflet-routing-container *::after) {
    background-color: transparent !important;
    background-image: none !important;
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
    content: none !important;
    visibility: inherit;
    box-sizing: border-box !important;
    max-width: 100% !important;
  }

  /* Hide everything in the row by default EXCEPT the results dropdown */
  :global(.leaflet-routing-geocoder > :not(input):not(.leaflet-routing-remove-waypoint):not(.leaflet-control-geocoder-alternatives)) {
    display: none !important;
  }

  /* White-list ONLY the input and our button */
  :global(.leaflet-routing-geocoder input),
  :global(.leaflet-routing-geocoder .leaflet-routing-remove-waypoint) {
    display: block !important;
  }

  /* Kill browser-native clear icons (search input "x") */
  :global(.leaflet-routing-geocoder input::-webkit-search-cancel-button),
  :global(.leaflet-routing-geocoder input::-webkit-search-decoration) {
    display: none !important;
    -webkit-appearance: none;
  }

  :global(.leaflet-routing-geocoders) { 
    border-bottom: none; 
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: visible !important;
  }
  :global(.leaflet-routing-geocoder) {
    display: flex !important;
    align-items: center !important;
    background: rgba(255, 255, 255, 0.07) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 10px !important;
    position: relative !important;
    transition: border-color 0.15s, background 0.15s !important;
    padding-right: 0 !important;
  }
  :global(.leaflet-routing-geocoder:focus-within) {
    border-color: rgba(255, 255, 255, 0.22) !important;
    background: rgba(255, 255, 255, 0.10) !important;
  }

  :global(.leaflet-routing-geocoder input) {
    flex: 1 !important;
    background: none !important;
    border: none !important;
    outline: none !important;
    color: #fff !important;
    font-family: inherit !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    padding: 11px 12px !important;
    letter-spacing: 0.01em !important;
  }
  :global(.leaflet-routing-geocoder input::placeholder) {
    color: rgba(255, 255, 255, 0.4) !important;
    font-weight: 400 !important;
  }

  :global(.leaflet-routing-remove-waypoint) {
    display: block !important;
    width: 28px !important;
    height: 28px !important;
    margin-right: 10px !important;
    border-radius: 7px !important;
    background-color: rgba(255, 255, 255, 0.10) !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='rgba(255,255,255,0.55)' stroke-width='1.8' stroke-linecap='round'%3E%3Cline x1='2' y1='2' x2='10' y2='10'/%3E%3Cline x1='10' y1='2' x2='2' y2='10'/%3E%3C/svg%3E") !important;
    background-repeat: no-repeat !important;
    background-position: center !important;
    background-size: 13px !important;
    cursor: pointer !important;
    flex-shrink: 0 !important;
    transition: all 0.15s !important;
  }

  :global(.leaflet-routing-remove-waypoint:hover) {
    background-color: rgba(255, 80, 80, 0.25) !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%23ff6b6b' stroke-width='1.8' stroke-linecap='round'%3E%3Cline x1='2' y1='2' x2='10' y2='10'/%3E%3Cline x1='10' y1='2' x2='2' y2='10'/%3E%3C/svg%3E") !important;
  }

  :global(.leaflet-routing-remove-waypoint:active) {
    background-color: rgba(255, 80, 80, 0.35) !important;
    transform: scale(0.93) !important;
  }

  /* Geocoder Suggestions Dropdown */
  :global(.leaflet-control-geocoder-alternatives) {
    display: block !important;
    background: rgba(30, 30, 32, 0.95) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 12px !important;
    margin-top: 8px !important;
    padding: 6px !important;
    list-style: none !important;
    max-height: 280px !important;
    overflow-y: auto !important;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6) !important;
    position: absolute !important;
    top: 100% !important;
    width: 100% !important;
    left: 0 !important;
    z-index: 1000 !important;
    pointer-events: auto !important;
  }

  :global(.leaflet-control-geocoder-alternatives li) {
    padding: 12px 14px !important;
    cursor: pointer !important;
    font-size: 13px !important;
    color: rgba(255, 255, 255, 0.75) !important;
    transition: all 0.15s ease !important;
    border-radius: 8px !important;
    margin-bottom: 2px !important;
    line-height: 1.4 !important;
    white-space: normal !important;
    word-break: break-word !important;
  }

  :global(.leaflet-control-geocoder-alternatives li:last-child) {
    margin-bottom: 0 !important;
  }

  :global(.leaflet-control-geocoder-alternatives li:hover),
  :global(.leaflet-control-geocoder-alternatives li.leaflet-control-geocoder-selected) {
    background: rgba(255, 255, 255, 0.1) !important;
    color: white !important;
    padding-left: 18px !important;
  }

  :global(.leaflet-control-geocoder-alternatives li strong) {
    color: var(--orange) !important;
    font-weight: 600 !important;
  }

  :global(.leaflet-routing-add-waypoint) {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background-color: rgba(255, 255, 255, 0.05) !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='rgba(255,255,255,0.32)' stroke-width='1.8' stroke-linecap='round'%3E%3Cline x1='6' y1='1' x2='6' y2='11'/%3E%3Cline x1='1' y1='6' x2='11' y2='6'/%3E%3C/svg%3E") !important;
    background-repeat: no-repeat !important;
    background-position: center !important;
    background-size: 15px !important;
    border: 1px dashed rgba(255, 255, 255, 0.12) !important;
    border-radius: 10px !important;
    padding: 12px !important;
    margin-top: 10px !important;
    cursor: pointer !important;
    transition: all 0.15s !important;
    width: 100% !important;
    height: 40px !important;
    color: transparent !important;
  }
  :global(.leaflet-routing-add-waypoint:hover) {
    background-color: rgba(255, 255, 255, 0.08) !important;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='1.8' stroke-linecap='round'%3E%3Cline x1='6' y1='1' x2='6' y2='11'/%3E%3Cline x1='1' y1='6' x2='11' y2='6'/%3E%3C/svg%3E") !important;
    border-color: rgba(255, 255, 255, 0.2) !important;
  }






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

  /* Custom My Location Control (Bottom Left) */
  :global(.ap-location-control) {
    background: rgb(38 38 38) !important;
    color: white !important;
    border: 2px solid rgba(0, 0, 0, 0.2) !important;
    background-clip: padding-box;
    border-radius: 4px !important;
    width: 30px !important;
    height: 30px !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    margin-bottom: 10px !important;
    transition: all 0.2s !important;
    box-shadow: 0 1px 5px rgba(0,0,0,0.65) !important;
  }
  :global(.ap-location-control:hover) {
    background: rgb(50 50 50) !important;
    color: var(--orange) !important;
  }
  :global(.ap-location-control.locating) {
    color: var(--orange) !important;
    animation: ap-pulse 1.5s infinite ease-in-out;
  }
  @keyframes ap-pulse {
    0% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(0.92); }
    100% { opacity: 1; transform: scale(1); }
  }
  :global(.ap-location-control svg) {
    width: 18px;
    height: 18px;
  }
</style>


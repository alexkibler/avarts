<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { pb } from '$lib/pb';
  import { env } from '$env/dynamic/public';
  import 'leaflet/dist/leaflet.css';
  import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';

  export let sessionId: string;
  export let centerLat: number;
  export let centerLon: number;
  export let radius: number;

  const dispatch = createEventDispatcher<{ routeStats: { distance: number } }>();

  let mapElement: HTMLElement;
  let map: any;
  let L: any;
  const markerMap = new Map<string, any>();
  let nodes: any[] = [];
  let unsubscribePb: (() => void) | null = null;
  let routingControl: any = null;

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
  }

  // ── Routing ──────────────────────────────────────────────────────────────────

  function addNodeAsWaypoint(node: any, marker: any) {
    if (!routingControl) return;
    const wps = routingControl.getWaypoints().filter((w: any) => w.latLng);
    wps.push(L.Routing.waypoint(L.latLng(node.lat, node.lon), `Check #${node.ap_location_id}`));
    routingControl.setWaypoints(wps);
    // Highlight the marker so the user knows it's in the route
    marker.setStyle(markerOptions(node.state, true));
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      if (!routingControl) return;
      const wps = routingControl.getWaypoints().filter((w: any) => w.latLng);
      // Replace or prepend as the start point
      const startWp = L.Routing.waypoint(
        L.latLng(pos.coords.latitude, pos.coords.longitude),
        'My Location'
      );
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
    dispatch('routeStats', { distance: 0 });
    // Reset marker highlights
    for (const node of nodes) {
      const marker = markerMap.get(node.id);
      if (marker) marker.setStyle(markerOptions(node.state, false));
    }
  }

  // Inject the My Location button into the LRM Start row after mount
  function injectLocationButton() {
    const container = document.querySelector('.leaflet-routing-container');
    if (!container) return;

    const inputs = container.querySelectorAll('.leaflet-routing-geocoder input');
    if (!inputs.length) return;
    const firstInput = inputs[0] as HTMLElement;
    const row = firstInput.closest('.leaflet-routing-geocoder');
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

    // ── Routing control ──────────────────────────────────────────────────────
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

    routingControl.on('routesfound', (e: any) => {
      const d = e.routes[0]?.summary?.totalDistance ?? 0;
      dispatch('routeStats', { distance: d });
    });

    // Inject My Location button once the LRM DOM is ready
    setTimeout(injectLocationButton, 400);

    // ── Nodes ────────────────────────────────────────────────────────────────
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
</script>

<div bind:this={mapElement} class="w-full h-full"></div>

<style>
  :global(.leaflet-tile) { border-style: none !important; }

  /* Route planner panel — dark theme */
  :global(.leaflet-routing-container) {
    background-color: rgb(38 38 38);
    color: white;
    border-radius: 7px;
    max-height: calc(100vh - 140px);
    overflow-y: auto;
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
    background: rgb(38 38 38) !important;
    color: white;
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

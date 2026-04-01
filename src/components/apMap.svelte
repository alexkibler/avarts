<script lang="ts">
  import { onMount, onDestroy, setContext, createEventDispatcher, tick } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { env } from '$env/dynamic/public';
  import { pb } from '$lib/database';
  import { userCookie } from '$lib/stores';
  import 'leaflet-routing-machine';
  import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
  import 'leaflet-control-geocoder';
  import 'lrm-graphhopper'

  import '@raruto/leaflet-elevation/src/index.js';
  import '@raruto/leaflet-elevation/src/index.css';

  import 'leaflet-simple-map-screenshoter';
  import * as imageConversion from 'image-conversion';

  import type { User, Route, Routes, Course, Coordinates, ElevationResponse, Activities, Waypoints } from '$lib/types';

  import { connectToAp, apClient, sendLocationChecks, type ApConnectionOptions } from '$lib/ap';
  import { pb as pocketbase } from '$lib/pb';

  export let bounds: L.LatLngBoundsExpression | undefined = undefined;
  export let view: L.LatLngExpression | undefined = undefined;
  export let zoom: number | undefined = undefined;
  export let user: User;
  export let from: string;
  export let routeData: Course;
  export let sessionId: string; // Add sessionId prop

  const dispatch = createEventDispatcher();

  let map: L.Map | undefined;
  let mapElement: HTMLElement;

  let waypoints: L.LatLng[] = [];
  let routingControl: L.Routing.Control | undefined;
  let route: Route
  let courseName: string = ""
  let elevationControl: L.elevationControl | undefined;
  let allowMapInteraction = true;
  let resetButtonContainer: HTMLElement | null = null;
  let visibleNav: boolean = true;

  let distance: number = 0;
  let elevationGain: number = 0;

  let type: string = "cycling";
  let mode: string = "bike"; // Force bike mode
  let activities: Activities;

  let formData: any;

  let simpleMapScreenshoter: L.simpleMapScreenshoter | undefined;
  let screenshotBlob: Blob
  let screenshotOptions = {
    cropImageByInnerWH: true,
    hidden: true,
    preventDownload: true,
    hideElementsWithSelectors: ['.leaflet-control-container', '.leaflet-marker-icon', '.leaflet-edgescale-pane'],
    mimeType: 'image/png',
  }

  let graphApi;
  let averageSpeed = 0;

  // Archipelago map nodes
  let mapNodes: any[] = [];
  let markers: L.Marker[] = [];

  export let apConnectionOptions: ApConnectionOptions; // Add options prop

  onMount(async() => {
    // Connect to Archipelago
    if (apConnectionOptions && sessionId) {
      await connectToAp(apConnectionOptions);
    }

    graphApi = env.PUBLIC_GRAPHHOPPER_API
    if (!graphApi)  {
      const { PUBLIC_GRAPHHOPPER_API } = await import ('$env/static/public')
      graphApi = PUBLIC_GRAPHHOPPER_API;
    }

    if (!bounds && (!view || !zoom)) {
      throw new Error('Must set either bounds, or view and zoom.');
    }

    map = L.map(mapElement)
      .on('zoom', (e: MouseEvent) => dispatch('zoom', e))
      .on('popupopen', async (e: L.map) => {
        await tick();
        e.popup.update();
      });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    routingControl = L.Routing.control({
      routeWhileDragging: false, // disable dragging nodes arbitrarily
      router: env.PUBLIC_GRAPHHOPPER_URL ?
        L.Routing.graphHopper(undefined, {
          serviceUrl: env.PUBLIC_GRAPHHOPPER_URL,
          urlParameters: {
            profile: mode,
          }
        })
      : env.PUBLIC_GRAPHHOPPER_API ?
        L.Routing.graphHopper(graphApi, {
          urlParameters: {
            profile: mode,
          }
        })
      : null,
      showAlternatives: false,
      lineOptions: {
        styles: [{ color: 'orange', opacity: 0.8, weight: 6 }]
      },
      createMarker: function() { return null; } // Don't create LRM default markers, use our own
    }).addTo(map);

    simpleMapScreenshoter = L.simpleMapScreenshoter(screenshotOptions).addTo(map);

    async function getElevationData(coordinates: Coordinates) {
      try {
        const apiUrl = 'https://api.open-elevation.com/api/v1/lookup';
        const locations: ElevationResponse = coordinates.map(coord => ({
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
          console.error('Open-Elevation API Error:', response.status, response.statusText);
          throw new Error('Failed to fetch elevation data');
        }
      } catch (error) {
        console.error('Error in getElevationData:', error);
        throw error;
      }
    }

    routingControl.on('waypointschanged', handleWaypointsChanged);

    routingControl.on('routesfound', async function (e: Routes) {
      route = e.routes[0];
      const elevationData = await getElevationData(route.coordinates);
      route.coordinates.forEach((coord: Coordinates, index: number) => {
        coord.meta = { elevation: elevationData[index] };
      });
      distance = route.summary.totalDistance;
      elevationGain = route.summary.totalAscend;

      if (!elevationControl) {
        elevationControl = L.control.elevation({
          srcFolder: 'https://unpkg.com/@raruto/leaflet-elevation/src/',
          detached: false, position: "bottomright", slope: "summary",
          altitude: true, time: false, summary: false, followMarker: true,
          autofitBounds: false, legend: false, waypoints: false, wptLabels: false,
        }).addTo(map);
      }
      elevationControl.clear();
      elevationControl.load(generateGPX(route))
    });

    if (routeData) {
      if (routeData.builder.actualWaypoints) {
        waypoints = routeData.builder.actualWaypoints.map((waypoint: Waypoints) => waypoint.latLng);
      } else if (routeData.builder.inputWaypoints) {
        waypoints = routeData.builder.inputWaypoints.map((waypoint: Waypoints) => waypoint.latLng);
      }
      routingControl?.setWaypoints(waypoints);
      route = routeData.builder
      routingControl?.route();
      courseName = routeData.title;
    }

    averageSpeed = 25; // Default average speed for cycling

    fixButton();

    const leafletRoutingDiv = document.querySelector('.leaflet-routing-container');
    if (leafletRoutingDiv) {
      resetButtonContainer = document.createElement('div');
      resetButtonContainer.classList.add('absolute', 'bottom-3', 'left-[6px]', 'z-50');

      const resetButton = document.createElement('button');
      resetButton.textContent = 'Reset Route';
      resetButton.classList.add('text-sm', 'font-semibold', 'border', 'rounded-[4px]', 'py-[1px]', 'px-1', 'mr-3', 'hover:bg-neutral-700');
      resetButton.addEventListener('click', resetRoute);

      resetButtonContainer.appendChild(resetButton);
      leafletRoutingDiv.appendChild(resetButtonContainer);
    }

    // Load nodes from PocketBase for Archipelago
    await loadMapNodes();

    // Subscribe to map_nodes changes
    pocketbase.collection('map_nodes').subscribe('*', function (e) {
        if (e.action === 'update' && e.record.session === sessionId) {
            // Reload markers to reflect status changes
            loadMapNodes();
        }
    });
  });

  onDestroy(() => {
    pocketbase.collection('map_nodes').unsubscribe('*');
    map?.remove();
    map = undefined;
  });

  setContext('map', {
    getMap: () => map
  });

  $: if (map && from == "new") {
    if (bounds) {
      map.fitBounds(bounds);
    } else if (view && zoom) {
      map.setView(view, zoom);
    }
  }

  async function loadMapNodes() {
      if (!sessionId) return;
      try {
          mapNodes = await pocketbase.collection('map_nodes').getFullList({
              filter: \`session = "\${sessionId}"\`,
          });

          renderMarkers();
      } catch (e) {
          console.error("Failed to load map nodes:", e);
      }
  }

  function renderMarkers() {
      if (!map) return;

      // Clear existing markers
      markers.forEach(m => map!.removeLayer(m));
      markers = [];

      mapNodes.forEach(node => {
          if (node.state === 'Available' || node.state === 'Checked') {
              const iconUrl = node.state === 'Checked' ? '/finish.png' : '/waypoint.png';

              const marker = L.marker([node.lat, node.lon], {
                  icon: L.icon({
                      iconUrl: iconUrl,
                      iconSize: [20, 20],
                  }),
              }).addTo(map!);

              marker.on('click', () => {
                  if (node.state === 'Available') {
                      addWaypoint(L.latLng(node.lat, node.lon));
                  } else {
                      alert("This node is already checked!");
                  }
              });

              markers.push(marker);
          }
      });
  }

  function addWaypoint(latLng: L.LatLng) {
      waypoints.push(latLng);
      routingControl?.setWaypoints(waypoints);
  }

  function handleWaypointsChanged() {
    const newWaypoints = routingControl?.getWaypoints().map((waypoint) => waypoint.latLng);
    if (newWaypoints) {
      // Filter out nulls
      waypoints = newWaypoints.filter(w => w !== null && w !== undefined);
    }
  }

  function exportToGPX() {
    if (route) {
      const gpxData = generateGPX(route);
      const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = 'route.gpx';
      link.click();
    } else {
      console.error('No route available to export.');
    }
  }

  function generateGPX(routeData: Route) {
    const gpx = \`<?xml version='1.0' encoding='UTF-8'?>
<gpx version="1.1" creator="\${user.name}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>\${courseName}</name>
  </metadata>
  <trk>
    <name>\${courseName}</name>
    <type>\${type}</type>
    <trkseg>
      \${routeData.coordinates.map((coord: Coordinates, index: number) =>\`<trkpt lat="\${coord.lat}" lon="\${coord.lng}">
        <ele>\${coord.meta.elevation}</ele>
      </trkpt>\`).join('\\n')}
    </trkseg>
  </trk>
</gpx>\`;
    return gpx;
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    const gpx = generateGPX(route)
    await createScreenshot()

    const formElement = event.target as HTMLFormElement;
    formData = new FormData(formElement);

    formData.append('user', user.id);
    formData.append('gpx', new Blob([gpx], { type: 'application/gpx+xml' }), 'activity.gpx')
    formData.append('distance', distance);
    formData.append('elevation', elevationGain);
    formData.append('time', ((distance/1000)/(averageSpeed) * 60 * 60).toFixed(0));
    formData.append('sport', type);
    formData.append('img', screenshotBlob, 'route.jpeg')
    formData.append('builder', JSON.stringify(route))

    let response = await fetch('/create', { method: 'POST', body: formData });
    if (response.ok) {
      let link = await response.json()
      setTimeout(() => window.location.href = \`/routes/\${link}\`, 2000)
    }
  }

  export async function createScreenshot(){
    const format = 'blob';
    const overridedPluginOptions = { mimeType: 'image/jpeg' };
    if (map && route) {
      const routeBounds = L.latLngBounds(route.coordinates);
      map.fitBounds(routeBounds.pad(0.1));
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    screenshotBlob = await simpleMapScreenshoter.takeScreen(format, overridedPluginOptions);
    screenshotBlob = await imageConversion.compressAccurately(screenshotBlob,100);
  }

  function resetRoute() {
    waypoints = [];
    routingControl?.setWaypoints([]);
    elevationControl?.clear();
  }

  function fixButton() {
    const interactiveSpans = document.querySelectorAll('.leaflet-routing-remove-waypoint');
    const interactiveLinks = document.querySelectorAll('.elevation-toggle-icon');
    interactiveSpans.forEach(span => span.addEventListener('click', e => e.stopPropagation()));
    interactiveLinks.forEach(link => link.addEventListener('click', e => e.stopPropagation()));
  }

  function toggleNav() {
    let elements = document.getElementsByClassName("leaflet-routing-container") as HTMLCollectionOf<HTMLElement>;
    let button = document.getElementById("showNav")!;
    for (var i = 0; i < elements.length; i++) {
      if (visibleNav) {
        elements[i].style.display = 'none';
        button.style.display = "inline";
        visibleNav = false;
      } else {
        elements[i].style.display = 'inline';
        button.style.display = "none";
        visibleNav = true;
      }
    }
  }
</script>

<div class="w-full h-full relative">
  <button on:click={() => toggleNav()} id="showNav" style="display: none;" class="absolute top-[10px] right-[15px] z-50 w-[36px] h-[36px] bg-neutral-800 rounded-[4px] text-white flex items-center">
    <svg class="w-full" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path class="stroke-neutral-400 stroke-2" d="M8.835 14H5a1 1 0 0 0-.9.7l-2 6c-.1.1-.1.2-.1.3 0 .6.4 1 1 1h18c.6 0 1-.4 1-1 0-.1 0-.2-.1-.3l-2-6a1 1 0 0 0-.9-.7h-3.835"/><path class="fill-orange-500" d="M18 8c0 4.5-6 9-6 9s-6-4.5-6-9a6 6 0 0 1 12 0"/><circle class="fill-neutral-800" cx="12" cy="8" r="2"/></svg>
  </button>
  <div class="w-full h-[90%]" bind:this={mapElement}>
    {#if map}
      <slot />
    {/if}
  </div>
  <div class="flex flex-row w-full h-[10%] bg-neutral-800 border border-neutral-400">
    <!-- Removed Sport Type toggle, fixed to cycling -->
    <div class="flex flex-col justify-center h-full w-[20%] border-e border-neutral-400 pl-1 md:pl-5">
      <span class="text-white text-xs md:text-sm">Distance</span>
      <span class="text-neutral-400 text-sm md:text-2xl font-semibold">
        {#if distance}{(distance / 1000).toFixed(2)}{:else}0.00{/if} km
      </span>
    </div>
    <div class="flex flex-col justify-center h-full w-[20%] border-e border-neutral-400 pl-1 md:pl-5">
      <span class="text-white text-xs md:text-sm">Elevation Gain</span>
      <span class="text-neutral-400 text-sm md:text-2xl font-semibold">
        {#if elevationGain}{(elevationGain*0.6).toFixed(2)}{:else}0.00{/if} m
      </span>
    </div>
    <div class="flex flex-col justify-center h-full w-[20%] border-e border-neutral-400 pl-1 md:pl-5">
      <span class="text-white text-xs md:text-sm">Est. Moving Time</span>
      <span class="text-neutral-400 text-sm md:text-2xl font-semibold">
        {#if averageSpeed}{((distance/1000)/(averageSpeed) * 60).toFixed(0)}{/if} min.
      </span>
    </div>
    <div class="flex flex-row w-[40%]">
      <div class="w-[75.2%]">
        <form id="input" method="POST" on:submit={handleSubmit} class="flex justify-center items-center h-full">
          <div class="flex flex-col">
            <span class="text-white -mt-2 text-sm">Course name:</span>
            <input bind:value={courseName} type="text" name="title" class="bg-neutral-700 text-white text-md md:text-2xl border border-neutral-400 w-full" />
          </div>
        </form>
      </div>
      <div class="flex justify-center items-center h-full w-[25.8%] border-s border-neutral-400">
        <button on:click={exportToGPX} class="text-white w-full h-full text-md md:text-xl font-semibold hover:bg-neutral-900 hover:text-orange-600">Export GPX</button>
      </div>
    </div>
  </div>
</div>

<style>
/* Same CSS as original leafletEdit.svelte kept for Map styles */
:global(.leaflet-tile) { border-style: none !important; }
:global(.elevation-control .area) { fill:  #ff9f24 ; opacity: 1; }
:global(.elevation-control .background) { background-color: rgb(38 38 38); }
:global(.tick text, .axis text) { font-size: 15px; fill: white !important; color: white !important; stroke-width: 0px !important; }
:global(.elevation-detached.lightblue-theme .area) { stroke: orange; stroke-width: 3px; }
:global(.leaflet-elevation-pane, .leaflet-marker-pane, .elevation-polyline){ pointer-events: none !important; }
:global(.leaflet-marker-icon) { opacity: 1; } /* REVEALED MARKERS */
:global(img.leaflet-marker-draggable) { opacity: 1 !important; }
:global(.leaflet-bottom) { max-width: 40% !important; }
:global(.background) { height: 100%; }
:global(.grid){ opacity: 0; }
:global(.leaflet-routing-container) { background-color: rgb(38 38 38); color: white; border-radius: 7px; }
:global(.leaflet-routing-geocoders) { border-bottom: none; }
:global(.leaflet-routing-geocoder input) { background-color: rgb(38 38 38); padding: 2px; border-radius: 5px; }
</style>

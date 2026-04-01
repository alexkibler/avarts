<script lang="ts">
  import { onMount } from 'svelte';
  import 'leaflet/dist/leaflet.css';
  import { fetchCyclingIntersections, shuffleArray } from '$lib/osm';
  import { pb } from '$lib/pb';
  import { userCookie } from '$lib/stores';

  let mapElement: HTMLElement;
  let map: any;
  let centerMarker: any = null;
  let radiusCircle: any = null;
  let L: any;

  // Form Data
  let centerLat = 50.8503; // Default Brussels
  let centerLon = 4.3517;
  let radius = 5000;
  let checkCount = 10;
  let seedName = '';
  let slotName = '';
  let serverUrl = 'archipelago.gg:38281';

  let isGenerating = false;
  let errorMsg = '';

  onMount(async () => {
    L = await import('leaflet');
    map = L.map(mapElement).setView([centerLat, centerLon], 12);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    updateMapPin(centerLat, centerLon);

    map.on('click', (e: any) => {
      centerLat = e.latlng.lat;
      centerLon = e.latlng.lng;
      updateMapPin(centerLat, centerLon);
    });
  });

  function updateMapPin(lat: number, lon: number) {
    if (centerMarker) {
      centerMarker.setLatLng([lat, lon]);
    } else {
      centerMarker = L.marker([lat, lon], {
        icon: L.icon({
          iconUrl: '/start.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41]
        })
      }).addTo(map);
    }

    if (radiusCircle) {
      radiusCircle.setLatLng([lat, lon]);
      radiusCircle.setRadius(radius);
    } else {
      radiusCircle = L.circle([lat, lon], {
        radius: radius,
        color: 'red',
        fillColor: '#f03',
        fillOpacity: 0.1
      }).addTo(map);
    }
  }

  $: {
    if (map && centerLat && centerLon && radius) {
      updateMapPin(centerLat, centerLon);
    }
  }

  async function generateSeed() {
    isGenerating = true;
    errorMsg = '';
    successMsg = '';

    try {
      // 1. Fetch Intersections from OSM Overpass
      const intersections = await fetchCyclingIntersections(centerLat, centerLon, radius);

      if (intersections.length < checkCount) {
        throw new Error(`Found only ${intersections.length} intersections, but requested ${checkCount}. Increase radius or decrease check count.`);
      }

      // 2. Shuffle and Select the required number
      const selectedNodes = shuffleArray(intersections).slice(0, checkCount);

      // 3. Create Game Session in PocketBase
      // Assuming a logged in user via the store ($userCookie)
      const userId = $userCookie?.user?.id;
      if (!userId) {
        throw new Error('Must be logged in to create a game session.');
      }

      const sessionRecord = await pb.collection('game_sessions').create({
        user: userId,
        ap_seed_name: seedName,
        ap_server_url: serverUrl,
        ap_slot_name: slotName,
        center_lat: centerLat,
        center_lon: centerLon,
        radius: radius,
        status: 'Active'
      });

      // 4. Batch Insert Map Nodes into PocketBase
      // In PocketBase, batch creation is typically done via concurrent create requests
      const createPromises = selectedNodes.map((node, index) => {
        return pb.collection('map_nodes').create({
          session: sessionRecord.id,
          ap_location_id: 800000 + (index + 1), // Assuming START_ID from items.py
          osm_node_id: node.id.toString(),
          lat: node.lat,
          lon: node.lon,
          state: 'Hidden'
        });
      });

      await Promise.all(createPromises);

      window.location.href = `/game/${sessionRecord.id}`;

    } catch (err: any) {
      errorMsg = err.message || 'An error occurred during generation.';
    } finally {
      isGenerating = false;
    }
  }
</script>

<svelte:head>
  <title>New IRL Cycling Game</title>
</svelte:head>

<div class="p-6 text-white max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
  <div class="bg-neutral-800 p-6 rounded-lg shadow-lg">
    <h1 class="text-3xl font-bold mb-6 text-orange-500">Create New Archipelago Session</h1>

    <form on:submit|preventDefault={generateSeed} class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1" for="seedName">Seed Name / Description</label>
        <input id="seedName" bind:value={seedName} required class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500" />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1" for="serverUrl">Archipelago Server</label>
          <input id="serverUrl" bind:value={serverUrl} required class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1" for="slotName">Slot Name</label>
          <input id="slotName" bind:value={slotName} required class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1" for="radius">Radius (meters)</label>
          <input id="radius" type="number" bind:value={radius} required min="100" max="50000" class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1" for="checkCount">Check Count</label>
          <input id="checkCount" type="number" bind:value={checkCount} required min="1" max="1000" class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500" />
        </div>
      </div>

      <p class="text-xs text-neutral-400">Click on the map to set the center point for node generation.</p>

      <div class="pt-4">
        <button type="submit" disabled={isGenerating} class="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-4 rounded transition disabled:opacity-50">
          {isGenerating ? 'Generating Nodes & Session...' : 'Generate Session'}
        </button>
      </div>

      {#if errorMsg}
        <div class="mt-4 p-3 bg-red-900/50 border border-red-500 text-red-200 rounded">
          {errorMsg}
        </div>
      {/if}

    </form>
  </div>

  <div class="bg-neutral-800 rounded-lg shadow-lg overflow-hidden h-[600px] border border-neutral-700">
    <div bind:this={mapElement} class="w-full h-full"></div>
  </div>
</div>

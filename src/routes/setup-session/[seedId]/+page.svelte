<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { pb } from '$lib/pb';
  import { userCookie } from '$lib/stores';
  import { apClient } from '$lib/ap';
  import { fetchCyclingIntersections, shuffleArray } from '$lib/osm';
  import { updateSessionWithMapDetails } from '$lib/db';
  import 'leaflet/dist/leaflet.css';

  const seedId = $page.params.seedId;

  let mapElement: HTMLElement;
  let map: any;
  let centerMarker: any = null;
  let radiusCircle: any = null;
  let L: any;

  // Form state
  let centerLat = 40.4406; // Default Pittsburgh
  let centerLon = -79.9959;
  let radius = 5000;
  let addressQuery = '';

  // UI state
  let loadError = '';
  let isGeocoding = false;
  let geocodeError = '';
  let isLocating = false;
  let locationError = '';
  let isGenerating = false;
  let generationError = '';

  // Progress tracking
  let generationStatus = '';
  let generationProgress = 0; // 0-100

  // Session data
  let sessionId = '';
  let apItemCount = 0;

  onMount(async () => {
    try {
      // Verify AP is connected and get item count
      if (!apClient.authenticated) {
        loadError = 'Not connected to Archipelago. Please connect first.';
        return;
      }

      apItemCount = apClient.items.received.length;
      if (apItemCount === 0) {
        loadError = 'No items received from Archipelago. Check your connection.';
        return;
      }

      console.log(`[Setup] AP item count: ${apItemCount}`);

      // Initialize map
      const leafletMod = await import('leaflet');
      L = leafletMod.default ?? leafletMod;
      window.L = L;
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
    } catch (error: any) {
      loadError = error?.message || 'Failed to initialize setup page.';
      console.error('[Setup] Init error:', error);
    }
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

  async function searchAddress() {
    if (!addressQuery.trim()) return;
    isGeocoding = true;
    geocodeError = '';
    try {
      const res = await fetch(
        `/api/geocode?q=${encodeURIComponent(addressQuery.trim())}&limit=1&locale=en`
      );
      if (!res.ok) throw new Error('Geocoding request failed.');
      const data = await res.json();
      if (!data.hits || data.hits.length === 0) {
        geocodeError = 'No results found. Try a different address.';
        return;
      }
      const { lat, lng } = data.hits[0].point;
      centerLat = lat;
      centerLon = lng;
      map.setView([centerLat, centerLon], 13);
      updateMapPin(centerLat, centerLon);
    } catch (err: any) {
      geocodeError = err.message || 'Failed to geocode address.';
    } finally {
      isGeocoding = false;
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      locationError = 'Geolocation is not supported by your browser.';
      return;
    }
    isLocating = true;
    locationError = '';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        centerLat = pos.coords.latitude;
        centerLon = pos.coords.longitude;
        map.setView([centerLat, centerLon], 13);
        updateMapPin(centerLat, centerLon);
        isLocating = false;
      },
      (err) => {
        locationError = err.message || 'Could not retrieve your location.';
        isLocating = false;
      }
    );
  }

  async function generateSession() {
    isGenerating = true;
    generationError = '';
    generationProgress = 0;
    generationStatus = '';

    try {
      const userId = $userCookie?.user?.id;
      if (!userId) {
        throw new Error('Not logged in.');
      }

      // Step 1: Fetch intersections
      generationStatus = 'Fetching cycling intersections...';
      generationProgress = 25;

      const intersections = await fetchCyclingIntersections(centerLat, centerLon, radius);

      if (intersections.length < apItemCount) {
        generationError = `Found only ${intersections.length} intersections, but AP has ${apItemCount} items. Increase radius or decrease the AP check count.`;
        isGenerating = false;
        return;
      }

      // Step 2: Create game session
      generationStatus = 'Creating game session...';
      generationProgress = 40;

      const sessionRecord = await pb.collection('game_sessions').create({
        user: userId,
        ap_seed_name: seedId,
        ap_server_url: apClient.room.seedName ? 'connected' : '',  // Placeholder
        ap_slot_name: 'Setup',
        status: 'SetupInProgress',
        center_lat: centerLat,
        center_lon: centerLon,
        radius: radius
      });

      sessionId = sessionRecord.id;

      // Step 3: Create nodes
      generationStatus = `Creating ${apItemCount} nodes...`;
      generationProgress = 50;

      const selectedNodes = shuffleArray(intersections).slice(0, apItemCount);

      for (let i = 0; i < selectedNodes.length; i++) {
        const node = selectedNodes[i];
        let nodeName = `OSM Node ${node.id}`;

        try {
          const res = await fetch(
            `/api/geocode?q=${node.lat},${node.lon}&limit=1&locale=en`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.hits && data.hits.length > 0) {
              nodeName = data.hits[0].name;
            }
          }
        } catch (e) {
          console.warn('Reverse geocode failed for node', node.id, e);
        }

        await pb.collection('map_nodes').create({
          session: sessionId,
          ap_location_id: 800000 + (i + 1),
          osm_node_id: node.id.toString(),
          name: nodeName,
          lat: node.lat,
          lon: node.lon,
          state: 'Hidden'
        }, { requestKey: `map_node_${i}` });

        // Update progress
        const nodeProgress = ((i + 1) / selectedNodes.length) * 40; // 40% for nodes
        generationProgress = 50 + nodeProgress;

        // Small delay to avoid overwhelming the API
        await new Promise(r => setTimeout(r, 50));
      }

      // Step 4: Sync state with AP
      generationStatus = 'Syncing with Archipelago...';
      generationProgress = 95;

      // Call syncArchipelagoState to set initial node states
      const { syncArchipelagoState } = await import('$lib/ap');
      // Note: syncArchipelagoState is private, so this might not work
      // Instead, we'll rely on the game page to sync on load

      // Step 5: Update session to Active
      generationStatus = 'Finalizing...';
      generationProgress = 99;

      await updateSessionWithMapDetails(sessionId, centerLat, centerLon, radius);

      generationProgress = 100;
      generationStatus = 'Session created!';

      // Redirect to game
      setTimeout(() => {
        goto(`/game/${sessionId}`);
      }, 500);
    } catch (error: any) {
      console.error('[Setup] Generation error:', error);
      generationError = error?.message || 'Failed to create session.';
    } finally {
      isGenerating = false;
    }
  }
</script>

<svelte:head>
  <title>Set Up Bikeapelago Session</title>
</svelte:head>

<div class="p-6 text-white max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
  <!-- Left panel: Form -->
  <div class="bg-neutral-800 p-6 rounded-lg shadow-lg">
    <h1 class="text-3xl font-bold mb-2 text-orange-500">Set Up Your Session</h1>
    <p class="text-neutral-400 text-sm mb-6">
      Choose your center point on the map to generate {apItemCount} intersections
    </p>

    {#if loadError}
      <div class="mb-4 p-3 bg-red-900/50 border border-red-500 text-red-200 rounded">
        {loadError}
      </div>
    {:else}
      <div class="space-y-4">
        <!-- Address search -->
        <div>
          <label class="block text-sm font-medium mb-1">Search Address</label>
          <div class="flex gap-2">
            <input
              type="text"
              placeholder="Search address or place…"
              bind:value={addressQuery}
              on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), searchAddress())}
              disabled={isGeocoding || isGenerating}
              class="flex-1 bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white placeholder-neutral-400 focus:outline-none focus:border-orange-500 disabled:opacity-50"
            />
            <button
              type="button"
              on:click={searchAddress}
              disabled={isGeocoding || !addressQuery.trim() || isGenerating}
              class="bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white font-medium px-4 py-2 rounded transition disabled:opacity-50 whitespace-nowrap"
            >
              {isGeocoding ? 'Searching…' : 'Search'}
            </button>
          </div>
          {#if geocodeError}
            <p class="mt-1 text-xs text-red-400">{geocodeError}</p>
          {/if}
        </div>

        <!-- Use my location -->
        <button
          type="button"
          on:click={useMyLocation}
          disabled={isLocating || isGenerating}
          class="w-full flex items-center justify-center gap-2 bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white text-sm font-medium px-4 py-2 rounded transition disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-4 h-4 text-orange-400 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          {isLocating ? 'Locating…' : 'Use My Location'}
        </button>

        <!-- Radius control -->
        <div>
          <label class="block text-sm font-medium mb-2">Radius (meters)</label>
          <input
            type="range"
            min="100"
            max="50000"
            step="100"
            bind:value={radius}
            disabled={isGenerating}
            class="w-full"
          />
          <p class="text-xs text-neutral-400 mt-1">{radius.toLocaleString()} meters</p>
        </div>

        <!-- Status -->
        <div class="pt-2 border-t border-neutral-600">
          <p class="text-sm text-neutral-300 mb-2">
            Intersections needed: <strong>{apItemCount}</strong>
          </p>
        </div>

        <!-- Generation progress -->
        {#if isGenerating}
          <div class="space-y-2">
            <p class="text-sm text-orange-400">{generationStatus}</p>
            <div class="w-full bg-neutral-700 rounded h-2 overflow-hidden">
              <div
                class="bg-orange-500 h-full transition-all"
                style="width: {generationProgress}%"
              />
            </div>
            <p class="text-xs text-neutral-400 text-right">{Math.round(generationProgress)}%</p>
          </div>
        {/if}

        {#if generationError}
          <div class="p-3 bg-red-900/50 border border-red-500 text-red-200 rounded text-sm">
            {generationError}
          </div>
        {/if}

        <!-- Generate button -->
        <button
          on:click={generateSession}
          disabled={isGenerating}
          class="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-4 rounded transition disabled:opacity-50"
        >
          {isGenerating ? 'Generating…' : 'Create Session & Play'}
        </button>

        <p class="text-xs text-neutral-400">Click on the map to set the center point for node generation.</p>
      </div>
    {/if}
  </div>

  <!-- Right panel: Map -->
  <div class="bg-neutral-800 rounded-lg shadow-lg overflow-hidden h-[600px] border border-neutral-700">
    <div bind:this={mapElement} class="w-full h-full" />
  </div>
</div>

<style>
  :global(html, body) {
    overflow: auto;
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { apClient, getRoomInfoSessionKey } from '$lib/ap';
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

  // Generation state
  let isGenerating = false;
  let generationError = '';
  let jobId = '';
  let generationStatus = '';
  let generationProgress = 0; // 0-100
  let generationTotal = 0;
  let generationCompleted = 0;

  // AP state
  let apItemCount = 0;

  // AP state — make it reactive to multiple sources of truth
  $: {
    const room = apClient.room;
    const slotData = room.slotData as any;
    
    // 1. Try slot_data first (most explicit)
    const slotCount = slotData?.check_count ?? slotData?.checkCount;
    
    // 2. Try total locations (missing + checked) - subtract 1 for the "Goal" event
    const totalLocations = (room.missingLocations?.length ?? 0) + (room.checkedLocations?.length ?? 0);
    const locationCount = totalLocations > 0 ? totalLocations - 1 : 0;

    if (typeof slotCount === 'number' && slotCount > 0) {
      apItemCount = slotCount;
    } else if (locationCount > 0) {
      apItemCount = locationCount;
    } else {
      apItemCount = apClient.items.received.length;
    }
    
    console.log(`[Setup] Reactive count update: slot=${slotCount}, locations=${locationCount}, received=${apClient.items.received.length} -> Final: ${apItemCount}`);
  }

  let pollInterval: ReturnType<typeof setInterval>;

  onMount(async () => {
    try {
      // Handle data updates from AP explicitly
      const updateFromAp = () => {
        const room = apClient.room;
        const slotData = room.slotData as any;
        const totalLocations = (room.missingLocations?.length ?? 0) + (room.checkedLocations?.length ?? 0);
        const locationCount = totalLocations > 0 ? totalLocations - 1 : 0; // -1 for Goal

        if (slotData?.check_count) {
          apItemCount = slotData.check_count;
        } else if (locationCount > 0) {
          apItemCount = locationCount;
        } else {
          apItemCount = apClient.items.received.length;
        }
        console.log(`[Setup] Event-driven count update: ${apItemCount}`);
      };

      // Listen for the connection event which carries slotData
      apClient.room.on('connected', updateFromAp);
      // Also run it immediately in case we're already connected
      updateFromAp();

      // Verify AP is connected
      if (!apClient.authenticated) {
        loadError = 'Not connected to Archipelago. Please connect first.';
        return;
      }

      console.log(`[Setup] AP state:`, { 
        slotData: apClient.room.slotData, 
        received: apClient.items.received.length 
      });

      if (apItemCount === 0) {
        // Wait a brief moment if data hasn't synced yet
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (apItemCount === 0) {
           loadError = 'No locations found in Archipelago. Check your connection.';
           return;
        }
      }

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

      return () => {
        if (pollInterval) clearInterval(pollInterval);
      };
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
    generationStatus = 'Sending request to server...';

    try {
      const roomKey = getRoomInfoSessionKey();
      if (!roomKey) {
        throw new Error('Archipelago connection lost. Please reconnect.');
      }
      
      // Step 1: Call API to start generation
      const res = await fetch('/api/nodes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          centerLat,
          centerLon,
          radius,
          checkCount: apItemCount,
          seedName: seedId,
          serverUrl: roomKey.server_url,
          slotName: roomKey.slot_name
        })
      });

      if (res.status === 202) {
        const data = await res.json();
        jobId = data.jobId;
        console.log(`[Setup] Started job: ${jobId}`);
        generationStatus = 'Job queued, waiting to start...';

        // Step 2: Start polling for progress
        pollProgress();
      } else {
        const error = await res.json();
        throw new Error(error.message || `HTTP ${res.status}`);
      }
    } catch (error: any) {
      console.error('[Setup] Error starting generation:', error);
      generationError = error?.message || 'Failed to start node generation.';
      isGenerating = false;
    }
  }

  async function pollProgress() {
    let consecutiveErrors = 0;
    const MAX_ERRORS = 10;

    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/nodes/generate/${jobId}`);

        if (!res.ok) {
          consecutiveErrors++;
          if (consecutiveErrors > MAX_ERRORS) {
            throw new Error(`Server error: ${res.status}`);
          }
          return;
        }

        consecutiveErrors = 0;
        const data = await res.json();

        // Update progress
        generationProgress = data.progress.percentage;
        generationTotal = data.progress.total;
        generationCompleted = data.progress.completed;

        switch (data.status) {
          case 'pending':
            generationStatus = 'Waiting in queue...';
            break;
          case 'processing':
            generationStatus = `Creating nodes: ${generationCompleted}/${generationTotal}`;
            break;
          case 'completed':
            generationStatus = 'Setup complete!';
            clearInterval(pollInterval);
            console.log(`[Setup] Generation complete, session: ${data.sessionId}`);
            // Redirect to game after a brief delay
            setTimeout(() => {
              goto(`/game/${data.sessionId}`);
            }, 500);
            break;
          case 'failed':
            clearInterval(pollInterval);
            throw new Error(data.error || 'Generation failed');
          case 'cancelled':
            clearInterval(pollInterval);
            throw new Error('Generation was cancelled');
        }
      } catch (error: any) {
        clearInterval(pollInterval);
        console.error('[Setup] Poll error:', error);
        generationError = error?.message || 'Lost connection to server.';
        isGenerating = false;
      }
    }, 2000); // Poll every 2 seconds
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
          {isGenerating ? `Generating… (${generationCompleted}/${generationTotal})` : 'Create Session & Play'}
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

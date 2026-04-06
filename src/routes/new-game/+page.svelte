<script lang="ts">
	import { onMount } from 'svelte';
	import 'leaflet/dist/leaflet.css';
	import { fetchCyclingIntersections, shuffleArray } from '$lib/osm';
	import { pb } from '$lib/database';
	import { userCookie } from '$lib/stores';
	import SessionDialog from '../../components/SessionDialog.svelte';

	let mapElement: HTMLElement;
	let map: any;
	let centerMarker: any = null;
	let radiusCircle: any = null;
	let L: any;

	// Form Data
	let centerLat = 40.4406; // Default Pittsburgh
	let centerLon = -79.9959;
	let radius = 5000;
	let checkCount = 10;
	let seedName = '';
	let slotName = '';
	let serverUrl = 'archipelago.gg:';
	let password = '';
	let gameMode: 'archipelago' | 'singleplayer' = 'archipelago';

	let isGenerating = false;
	let errorMsg = '';

	let generationProgress = 0;
	let generationTotal = 0;
	let generationCompleted = 0;
	let generationStatus = '';
	let jobId = '';
	let pollInterval: any;

	// Existing session detection
	let showSessionDialog = false;
	let sessionDialogType: 'resume' | 'collision' = 'resume';
	let existingSessionId = '';

	// Address search
	let addressQuery = '';
	let isGeocoding = false;
	let geocodeError = '';

	// Geolocation
	let isLocating = false;
	let locationError = '';

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

	onMount(async () => {
		const leafletMod = await import('leaflet');
		L = leafletMod.default ?? leafletMod;
		window.L = L;
		map = L.map(mapElement).setView([centerLat, centerLon], 12);

		L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution:
				'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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

		try {
			if (gameMode === 'archipelago') {
				// 1. Connect to Archipelago
				const response = await fetch('/api/ap/connect', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						serverUrl,
						slotName,
						password
					})
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.message || 'Failed to connect to Archipelago.');
				}

				const apData = await response.json();
				const seedId = apData.roomInfo?.seed_name;

				if (!seedId) {
					throw new Error('Archipelago connection successful but no seed name returned.');
				}

				// 2. Check if a session already exists for this AP seed (by anyone, via server-side check)
				const userId = $userCookie?.user?.id;
				if (!userId) {
					throw new Error('Must be logged in to create or join a game session.');
				}

				// Call the secure check-session endpoint to verify seed availability
				const checkResponse = await fetch(`/api/ap/check-session?seedId=${seedId}`);
				if (!checkResponse.ok) {
					const errorData = await checkResponse.json().catch(() => ({}));
				throw new Error(
					errorData.message || 'Failed to verify session availability. Please try again later.'
				);
				}

				const checkData = await checkResponse.json();

				if (checkData.exists) {
					existingSessionId = checkData.sessionId;

					if (checkData.isOwner) {
						// It's the user's own session, let them resume
						sessionDialogType = 'resume';
					} else {
						// It belongs to someone else, block access
						sessionDialogType = 'collision';
					}

					showSessionDialog = true;
					isGenerating = false;
					return;
				}

				// No existing session, proceed to setup
				window.location.href = `/setup-session/${seedId}?serverUrl=${encodeURIComponent(
					serverUrl
				)}&slotName=${encodeURIComponent(slotName)}&password=${encodeURIComponent(password)}`;
			} else {
				generationProgress = 0;
				generationStatus = 'Sending request to server...';

				const res = await fetch('/api/nodes/generate', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						centerLat,
						centerLon,
						radius,
						checkCount,
						seedName: seedName || 'Single Player',
						serverUrl: '',
						slotName: '',
						mode: 'singleplayer'
					})
				});

				if (res.status === 202) {
					const data = await res.json();
					jobId = data.jobId;
					generationStatus = 'Job queued, waiting to start...';
					pollProgress();
				} else {
					const error = await res.json();
					throw new Error(error.message || `HTTP ${res.status}`);
				}
			}
		} catch (err: any) {
			isGenerating = false;
			console.error('[GenerateSession Error]', err);
			if (err.response?.data) {
				const data = err.response.data;
				const details = Object.entries(data)
					.map(([key, val]: [string, any]) => `${key}: ${val.message || JSON.stringify(val)}`)
					.join(', ');
				errorMsg = `Validation failed: ${details}`;
			} else {
				errorMsg = err.message || 'An error occurred during generation.';
			}
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
						setTimeout(() => {
							window.location.href = `/game/${data.sessionId}`;
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
				errorMsg = error?.message || 'Lost connection to server.';
				isGenerating = false;
			}
		}, 2000); // Poll every 2 seconds
	}
</script>

<svelte:head>
	<title>New Bikeapelago Game</title>
</svelte:head>

<div class="p-6 text-white max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
	<div class="bg-neutral-800 p-6 rounded-lg shadow-lg">
		<h1 class="text-3xl font-bold mb-6 text-orange-500">Create New Game</h1>

		<form on:submit|preventDefault={generateSeed} class="space-y-4">
			<div>
				<label class="block text-sm font-medium mb-1">Game Mode</label>
				<div class="flex gap-4">
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="radio"
							name="mode"
							value="archipelago"
							bind:group={gameMode}
							class="text-orange-500 focus:ring-orange-500"
						/>
						<span>Archipelago Multiworld</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="radio"
							name="mode"
							value="singleplayer"
							bind:group={gameMode}
							class="text-orange-500 focus:ring-orange-500"
						/>
						<span>Single Player</span>
					</label>
				</div>
			</div>

			{#if gameMode === 'singleplayer'}
				<div>
					<label class="block text-sm font-medium mb-1" for="seedName">Save Name</label>
					<input
						id="seedName"
						bind:value={seedName}
						required
						class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
					/>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-sm font-medium mb-1" for="radius">Radius (meters)</label>
						<input
							id="radius"
							type="number"
							bind:value={radius}
							required
							min="100"
							max="50000"
							class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium mb-1" for="checkCount">Check Count</label>
						<input
							id="checkCount"
							type="number"
							bind:value={checkCount}
							required
							min="1"
							max="1000"
							class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
						/>
					</div>
				</div>

				<div>
					<label class="block text-sm font-medium mb-2">Center Point</label>

					<div class="flex gap-2">
						<input
							type="text"
							placeholder="Search address or place…"
							bind:value={addressQuery}
							on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), searchAddress())}
							disabled={isGeocoding}
							class="flex-1 bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white placeholder-neutral-400 focus:outline-none focus:border-orange-500 disabled:opacity-50"
						/>
						<button
							type="button"
							on:click={searchAddress}
							disabled={isGeocoding || !addressQuery.trim()}
							class="bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white font-medium px-4 py-2 rounded transition disabled:opacity-50 whitespace-nowrap"
						>
							{isGeocoding ? 'Searching…' : 'Search'}
						</button>
					</div>

					{#if geocodeError}
						<p class="mt-1 text-xs text-red-400">{geocodeError}</p>
					{/if}

					<button
						type="button"
						on:click={useMyLocation}
						disabled={isLocating}
						class="mt-2 flex items-center gap-2 bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white text-sm font-medium px-4 py-2 rounded transition disabled:opacity-50"
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

					{#if locationError}
						<p class="mt-1 text-xs text-red-400">{locationError}</p>
					{/if}
				</div>

				<p class="text-xs text-neutral-400">
					Click on the map to set the center point for node generation.
				</p>
			{/if}

			{#if gameMode === 'archipelago'}
				<div>
					<label class="block text-sm font-medium mb-1" for="serverUrl">Server URL</label>
					<input
						id="serverUrl"
						bind:value={serverUrl}
						required
						class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium mb-1" for="slotName">Slot Name</label>
					<input
						id="slotName"
						bind:value={slotName}
						required
						class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium mb-1" for="password">Password (Optional)</label>
					<input
						id="password"
						bind:value={password}
						class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
					/>
				</div>
			{/if}

			<!-- Generation progress -->
			{#if isGenerating && gameMode === 'singleplayer'}
				<div class="space-y-2 mt-4">
					<p class="text-sm text-orange-400">{generationStatus}</p>
					<div class="w-full bg-neutral-700 rounded h-2 overflow-hidden">
						<div class="bg-orange-500 h-full transition-all" style="width: {generationProgress}%" />
					</div>
					<p class="text-xs text-neutral-400 text-right">{Math.round(generationProgress)}%</p>
				</div>
			{/if}

			<div class="pt-4">
				<button
					type="submit"
					disabled={isGenerating}
					class="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-4 rounded transition disabled:opacity-50"
				>
					{#if gameMode === 'archipelago'}
						{isGenerating ? 'Connecting...' : 'Connect & Play'}
					{:else}
						{isGenerating
							? `Generating... (${generationCompleted}/${generationTotal})`
							: 'Generate Session'}
					{/if}
				</button>
			</div>

			{#if errorMsg}
				<div class="mt-4 p-3 bg-red-900/50 border border-red-500 text-red-200 rounded">
					{errorMsg}
				</div>
			{/if}
		</form>
	</div>

	<div
		class="bg-neutral-800 rounded-lg shadow-lg overflow-hidden h-[600px] border border-neutral-700"
	>
		<div bind:this={mapElement} class="w-full h-full"></div>
	</div>
</div>

<!-- Session Management Dialogs -->
<SessionDialog
	show={showSessionDialog}
	type={sessionDialogType}
	sessionId={existingSessionId}
	on:close={() => {
		showSessionDialog = false;
		isGenerating = false;
	}}
/>

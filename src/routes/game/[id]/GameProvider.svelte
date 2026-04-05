<script lang="ts">
	import { setContext, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { createGameEngine } from '$lib/engine/GameEngineFactory';
	import type { IGameEngine, ApConnectionOptions } from '$lib/engine/IGameEngine';
	import type { GameSession } from '$lib/types';
	import ApMap from '$components/apMap.svelte';

	export let session: GameSession;

	const gameEngine = createGameEngine(session);
	setContext('gameEngine', gameEngine);

	let apUrl = session.ap_server_url || '';
	let apSlot = session.ap_slot_name || '';
	let apPassword = '';

	let activeConnectionOptions: ApConnectionOptions | null = null;
	let connecting = false;
	let connectionError = '';

	let apMapRef: ApMap;

	if (!session.ap_server_url && session.status !== 'SetupInProgress') {
		// Single Player mode: connect immediately
		activeConnectionOptions = { url: '', game: '', name: '', sessionId: session.id };
		gameEngine.connect(activeConnectionOptions);
	} else if (apUrl && apSlot && session.status !== 'SetupInProgress') {
		if (typeof localStorage !== 'undefined') {
			apUrl = apUrl || localStorage.getItem('last_ap_url') || 'archipelago.gg:38281';
		}
		// Auto-connect if we have the server and slot
		handleConnect();
	}

	async function handleConnect() {
		connecting = true;
		connectionError = '';
		const options: ApConnectionOptions = {
			url: apUrl.trim(),
			game: 'Bikeapelago',
			name: apSlot.trim(),
			password: apPassword.trim() || undefined,
			sessionId: session.id
		};
		const ok = await gameEngine.connect(options);
		if (ok) {
			if (session.status === 'SetupInProgress') {
				const seedId = session.ap_seed_name || '';
				if (seedId) {
					console.log(
						`[Game] Connection successful, but session needs setup. Redirecting to setup-session/${seedId}...`
					);
					goto(`/setup-session/${seedId}`);
					return;
				}
			}

			activeConnectionOptions = options;
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('last_ap_url', options.url);
			}

			// We only update server url and slot name in pb, session prop won't automatically update here but we don't need it to.
			// pb.collection('game_sessions').update(session.id, { ap_server_url: options.url, ap_slot_name: options.name });
		} else {
			connectionError = 'Could not connect. Check server URL, slot name, and password.';
		}
		connecting = false;
	}

	onDestroy(() => {
		if (gameEngine) {
			gameEngine.disconnect();
		}
	});

	async function handleValidated() {
		// ApMap will handle node stats update via subscription
	}
</script>

{#if !activeConnectionOptions}
	<!-- ── Connect form ──────────────────────────────────────────────── -->
	<div class="flex items-center justify-center min-h-[calc(100vh-160px)]">
		<div class="bg-neutral-800 p-8 rounded-lg shadow-xl w-full max-w-md border border-neutral-600">
			<h2 class="text-2xl font-bold text-orange-500 mb-6">Connect to Archipelago</h2>
			<form on:submit|preventDefault={handleConnect} class="space-y-4">
				<div>
					<label class="block text-sm font-medium text-neutral-300 mb-1" for="ap-url"
						>Server URL</label
					>
					<input
						id="ap-url"
						bind:value={apUrl}
						required
						class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium text-neutral-300 mb-1" for="ap-slot"
						>Slot Name</label
					>
					<input
						id="ap-slot"
						bind:value={apSlot}
						required
						class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium text-neutral-300 mb-1" for="ap-pass"
						>Password <span class="text-neutral-500">(optional)</span></label
					>
					<input
						id="ap-pass"
						type="password"
						bind:value={apPassword}
						class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
					/>
				</div>
				{#if connectionError}
					<p class="text-red-400 text-sm">{connectionError}</p>
				{/if}
				<button
					type="submit"
					disabled={connecting}
					class="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded transition disabled:opacity-50"
				>
					{connecting ? 'Connecting…' : 'Connect & Play'}
				</button>
			</form>
		</div>
	</div>
{:else}
	<!-- ── Game layout: full-page ApMap (which now includes sidebar and bottom bar) ── -->
	<ApMap
		bind:this={apMapRef}
		sessionId={session.id}
		sessionName={session.ap_seed_name}
		apServerUrl={session.ap_server_url}
		apSlot={session.ap_slot_name}
		centerLat={session.center_lat ?? 0}
		centerLon={session.center_lon ?? 0}
		radius={session.radius ?? 500}
		on:validated={handleValidated}
	/>
{/if}

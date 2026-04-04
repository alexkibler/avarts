<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import ApMap from '$components/apMap.svelte';
	import { connectToAp, apClient } from '$lib/ap';
	import type { ApConnectionOptions } from '$lib/ap';
	import type { User, GameSession } from '$lib/types';

	export let data: { user: User; sessionId: string };

	let session: GameSession | null = null;
	let loadError = '';

	// AP connection form state (pre-filled from session, editable)
	let apUrl = '';
	let apSlot = '';
	let apPassword = '';

	// Set once successfully connected — mounts the map
	let activeConnectionOptions: ApConnectionOptions | null = null;
	let connecting = false;
	let connectionError = '';

	let apMapRef: ApMap;

	// Node stats for the HUD
	let nodeStats = { hidden: 0, available: 0, checked: 0 };

	onMount(async () => {
		try {
			session = await pb.collection('game_sessions').getOne(data.sessionId);
			if (!session) throw new Error('Session not found');

			// Immediate redirect if we know setup is needed and have the seed name
			if (session.status === 'SetupInProgress' && session.ap_seed_name) {
				console.log(
					`[Game] Session ${session.id} needs setup. Redirecting to setup-session/${session.ap_seed_name}...`
				);
				goto(`/setup-session/${session.ap_seed_name}`);
				return;
			}

			apUrl =
				session.ap_server_url || localStorage.getItem('last_ap_url') || 'archipelago.gg:38281';
			apSlot = session.ap_slot_name || '';

			// Auto-connect if we have the server and slot
			if (apUrl && apSlot) {
				handleConnect();
			}
		} catch (e: unknown) {
			loadError = e instanceof Error ? e.message : 'Failed to load session.';
		}
	});

	async function handleConnect() {
		if (!session) return;
		connecting = true;
		connectionError = '';
		const options: ApConnectionOptions = {
			url: apUrl.trim(),
			game: 'Bikeapelago',
			name: apSlot.trim(),
			password: apPassword.trim() || undefined,
			sessionId: session.id
		};
		const ok = await connectToAp(options);
		if (ok) {
			// Re-check status in case it was updated, or if we need to get seedId from AP connection
			if (session.status === 'SetupInProgress') {
				const seedId = session.ap_seed_name || apClient.room.seedName;
				console.log(
					`[Game] Connection successful, but session needs setup. Redirecting to setup-session/${seedId}...`
				);
				goto(`/setup-session/${seedId}`);
				return;
			}

			activeConnectionOptions = options;
			localStorage.setItem('last_ap_url', options.url);
			await pb.collection('game_sessions').update(session.id, {
				ap_server_url: options.url,
				ap_slot_name: options.name
			});
		} else {
			connectionError = 'Could not connect. Check server URL, slot name, and password.';
		}
		connecting = false;
	}

	async function handleValidated() {
		// ApMap will handle node stats update via subscription
	}
</script>

<svelte:head>
	<title>{session?.ap_seed_name ?? 'Loading…'} — Bikeapelago</title>
</svelte:head>

{#if loadError}
	<div class="flex items-center justify-center h-64">
		<p class="text-red-400 text-lg">{loadError}</p>
	</div>
{:else if !session}
	<div class="flex items-center justify-center h-64">
		<p class="text-neutral-400 text-lg">Loading session…</p>
	</div>
{:else if !activeConnectionOptions}
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
		bind:nodeStats
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

<style>
	:global(html, body) {
		overflow: hidden;
		height: 100%;
	}
</style>

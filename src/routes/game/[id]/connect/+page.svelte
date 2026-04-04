<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/database';
	import { connectToAp, getRoomInfoSessionKey } from '$lib/ap';
	import type { ApConnectionOptions } from '$lib/ap';
	import { getSessionByRoomInfo } from '$lib/database';
	import type { GameSession } from '$lib/types';

	const sessionId = $page.params.id;

	let session: GameSession | null = null;
	let loadError = '';

	// AP connection form state
	let apUrl = '';
	let apSlot = '';
	let apPassword = '';

	// Connection flow state
	let connecting = false;
	let connectionError = '';
	let checkingSession = false;

	// Load existing session on mount
	onMount(async () => {
		try {
			session = await pb.collection('game_sessions').getOne(sessionId);
			if (!session) throw new Error('Session not found');

			apUrl =
				session.ap_server_url || localStorage.getItem('last_ap_url') || 'archipelago.gg:38281';
			apSlot = session.ap_slot_name || '';

			// Auto-connect if session is already set up
			if (apUrl && apSlot && session.status === 'Active') {
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

		try {
			const options: ApConnectionOptions = {
				url: apUrl.trim(),
				game: 'Bikeapelago',
				name: apSlot.trim(),
				password: apPassword.trim() || undefined,
				sessionId: session.id
			};

			// Attempt AP connection
			const ok = await connectToAp(options);
			if (!ok) {
				connectionError = 'Could not connect. Check server URL, slot name, and password.';
				connecting = false;
				return;
			}

			// Successfully connected to AP
			console.log('[Connect] Successfully connected to AP');
			localStorage.setItem('last_ap_url', options.url);

			// Check if this session already exists in DB (or if it's new)
			checkingSession = true;
			const roomKey = getRoomInfoSessionKey();
			if (!roomKey) {
				connectionError = 'Failed to get session key from AP. Reconnect?';
				checkingSession = false;
				connecting = false;
				return;
			}

			console.log('[Connect] Room key:', roomKey);

			// Update current session with AP details (in case they changed)
			await pb.collection('game_sessions').update(session.id, {
				ap_server_url: options.url,
				ap_slot_name: options.name,
				ap_seed_name: roomKey.seed_name
			});

			// Check if this is a new AP session (not yet set up in bikeapelago)
			const existingSession = await getSessionByRoomInfo(
				roomKey.seed_name,
				roomKey.server_url,
				roomKey.slot_name
			);

			if (!existingSession) {
				// This is a new AP session — need to set up the map
				console.log('[Connect] New session detected, redirecting to setup...');
				goto(`/setup-session/${roomKey.seed_name}`);
			} else {
				// Session already exists — sync and go to game
				console.log('[Connect] Existing session found, syncing...');
				goto(`/game/${existingSession.id}`);
			}
		} catch (error: unknown) {
			console.error('[Connect] Error during connection:', error);
			connectionError = error instanceof Error ? error.message : 'Connection failed. Try again.';
		} finally {
			connecting = false;
			checkingSession = false;
		}
	}
</script>

<svelte:head>
	<title>Connect to Archipelago</title>
</svelte:head>

<div class="flex items-center justify-center min-h-screen bg-neutral-900">
	{#if loadError}
		<div class="bg-neutral-800 p-8 rounded-lg shadow-xl w-full max-w-md border border-red-500">
			<p class="text-red-400 text-lg">{loadError}</p>
			<p class="text-neutral-400 text-sm mt-4">
				<a href="/game" class="text-orange-400 hover:underline">← Back to games</a>
			</p>
		</div>
	{:else if !session}
		<div class="flex items-center justify-center">
			<p class="text-neutral-400 text-lg">Loading session…</p>
		</div>
	{:else}
		<div class="bg-neutral-800 p-8 rounded-lg shadow-xl w-full max-w-md border border-neutral-600">
			<h2 class="text-2xl font-bold text-orange-500 mb-2">Connect to Archipelago</h2>
			<p class="text-neutral-400 text-sm mb-6">Connect to an AP multiworld to play Bikeapelago</p>

			<form on:submit|preventDefault={handleConnect} class="space-y-4">
				<div>
					<label class="block text-sm font-medium text-neutral-300 mb-1" for="ap-url"
						>Server URL</label
					>
					<input
						id="ap-url"
						bind:value={apUrl}
						required
						disabled={connecting || checkingSession}
						class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500 disabled:opacity-50"
						placeholder="archipelago.gg:38281"
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
						disabled={connecting || checkingSession}
						class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500 disabled:opacity-50"
					/>
				</div>

				<div>
					<label class="block text-sm font-medium text-neutral-300 mb-1" for="ap-pass">
						Password <span class="text-neutral-500">(optional)</span>
					</label>
					<input
						id="ap-pass"
						type="password"
						bind:value={apPassword}
						disabled={connecting || checkingSession}
						class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500 disabled:opacity-50"
					/>
				</div>

				{#if connectionError}
					<p class="text-red-400 text-sm">{connectionError}</p>
				{/if}

				<button
					type="submit"
					disabled={connecting || checkingSession}
					class="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded transition disabled:opacity-50"
				>
					{#if connecting}
						Connecting…
					{:else if checkingSession}
						Setting up session…
					{:else}
						Connect to Archipelago
					{/if}
				</button>
			</form>

			<p class="text-neutral-400 text-xs mt-6 pt-4 border-t border-neutral-600">
				Don't have an AP multiworld yet?
				<a href="/yaml-creator" class="text-orange-400 hover:underline">Create one</a>
			</p>
		</div>
	{/if}
</div>

<style>
	:global(html, body) {
		overflow: auto;
	}
</style>

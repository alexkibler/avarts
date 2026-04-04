<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/pb';
	import { connectToAp, getRoomInfoSessionKey } from '$lib/ap';
	import type { ApConnectionOptions } from '$lib/ap';
	import { getSessionByRoomInfo } from '$lib/db';
	import { userCookie } from '$lib/stores';

	let apUrl = '';
	let apSlot = '';
	let apPassword = '';

	let connecting = false;
	let connectionError = '';
	let checkingSession = false;

	onMount(() => {
		apUrl = localStorage.getItem('last_ap_url') || 'archipelago.gg:38281';
	});

	async function handleConnect() {
		connecting = true;
		connectionError = '';

		try {
			const userId = $userCookie?.user?.id;
			if (!userId) {
				connectionError = 'Not logged in. Please log in first.';
				connecting = false;
				return;
			}

			// Create temporary session to pass to connectToAp
			const tempSession = await pb.collection('game_sessions').create({
				user: userId,
				ap_server_url: apUrl.trim(),
				ap_slot_name: apSlot.trim(),
				status: 'SetupInProgress',
				center_lat: 0,
				center_lon: 0,
				radius: 5000
			});

			const options: ApConnectionOptions = {
				url: apUrl.trim(),
				game: 'Bikeapelago',
				name: apSlot.trim(),
				password: apPassword.trim() || undefined,
				sessionId: tempSession.id
			};

			// Attempt AP connection
			const ok = await connectToAp(options);
			if (!ok) {
				// Delete temp session on connection failure
				await pb.collection('game_sessions').delete(tempSession.id);
				connectionError = 'Could not connect. Check server URL, slot name, and password.';
				connecting = false;
				return;
			}

			// Successfully connected to AP
			console.log('[Connect] Successfully connected to AP');
			localStorage.setItem('last_ap_url', options.url);

			checkingSession = true;

			// Get session key from AP
			const roomKey = getRoomInfoSessionKey();
			if (!roomKey) {
				await pb.collection('game_sessions').delete(tempSession.id);
				connectionError = 'Failed to get session key from AP. Reconnect?';
				checkingSession = false;
				connecting = false;
				return;
			}

			console.log('[Connect] Room key:', roomKey);

			// Update temp session with AP details
			await pb.collection('game_sessions').update(tempSession.id, {
				ap_seed_name: roomKey.seed_name
			});

			// Check if this AP session already exists in DB
			const existingSession = await getSessionByRoomInfo(
				roomKey.seed_name,
				roomKey.server_url,
				roomKey.slot_name
			);

			if (!existingSession || existingSession.id === tempSession.id) {
				// This is a new AP session — need to set up the map
				console.log('[Connect] New session detected, redirecting to setup...');
				goto(`/setup-session/${roomKey.seed_name}`);
			} else {
				// Session already exists — delete temp and go to existing
				await pb.collection('game_sessions').delete(tempSession.id);
				console.log('[Connect] Existing session found, status:', existingSession.status);

				if (existingSession.status === 'SetupInProgress') {
					console.log('[Connect] Existing session needs setup, redirecting...');
					goto(`/setup-session/${roomKey.seed_name}`);
				} else {
					console.log('[Connect] Existing session is active, syncing...');
					goto(`/game/${existingSession.id}`);
				}
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
</div>

<style>
	:global(html, body) {
		overflow: auto;
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { pb } from '$lib/database';
	import GameProvider from './GameProvider.svelte';
	import type { User, GameSession } from '$lib/types';

	export let data: { user: User; sessionId: string };

	let session: GameSession | null = null;
	let loadError = '';

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
		} catch (e: unknown) {
			loadError = e instanceof Error ? e.message : 'Failed to load session.';
		}
	});
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
{:else}
	<GameProvider {session} />
{/if}

<style>
	:global(html, body) {
		overflow: hidden;
		height: 100%;
	}
</style>

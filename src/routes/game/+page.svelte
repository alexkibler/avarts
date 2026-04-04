<script lang="ts">
	import { onMount } from 'svelte';
	import { pb } from '$lib/database';

	export let data: { user: any };

	let sessions: any[] = [];
	let loading = true;
	let loadError = '';

	onMount(async () => {
		try {
			sessions = await pb.collection('game_sessions').getFullList({
				filter: `user = "${data.user.id}"`,
				sort: '-created'
			});
		} catch (e: any) {
			loadError = e?.message ?? 'Failed to load sessions.';
		} finally {
			loading = false;
		}
	});

	async function markCompleted(sessionId: string) {
		await pb.collection('game_sessions').update(sessionId, { status: 'Completed' });
		sessions = sessions.map((s) => (s.id === sessionId ? { ...s, status: 'Completed' } : s));
	}
</script>

<svelte:head>
	<title>My Sessions — Bikeapelago</title>
</svelte:head>

<div class="max-w-4xl mx-auto px-4 py-8">
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-3xl font-bold text-orange-500">My Sessions</h1>
		<a
			href="/game/connect"
			class="bg-orange-600 hover:bg-orange-500 text-white font-semibold py-2 px-4 rounded transition"
		>
			+ New Session
		</a>
	</div>

	{#if loading}
		<p class="text-neutral-400">Loading sessions…</p>
	{:else if loadError}
		<p class="text-red-400">{loadError}</p>
	{:else if sessions.length === 0}
		<div class="bg-neutral-800 rounded-lg p-8 text-center border border-neutral-700">
			<p class="text-neutral-300 text-lg mb-4">No sessions yet.</p>
			<a
				href="/game/connect"
				class="bg-orange-600 hover:bg-orange-500 text-white font-semibold py-2 px-6 rounded transition"
			>
				Create your first session
			</a>
		</div>
	{:else}
		<div class="space-y-4">
			{#each sessions as session}
				<div
					class="bg-neutral-800 rounded-lg border border-neutral-700 p-5 flex flex-col sm:flex-row sm:items-center gap-4"
				>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 mb-1">
							<h2 class="text-white font-semibold text-lg truncate">{session.ap_seed_name}</h2>
							<span
								class="text-xs font-medium px-2 py-0.5 rounded-full {session.status === 'Active'
									? 'bg-green-900 text-green-300'
									: 'bg-neutral-700 text-neutral-400'}"
							>
								{session.status}
							</span>
						</div>
						<p class="text-neutral-400 text-sm">
							Server: {session.ap_server_url} &nbsp;·&nbsp; Slot: {session.ap_slot_name}
						</p>
						<p class="text-neutral-500 text-xs mt-1">
							Center: {session.center_lat.toFixed(4)}, {session.center_lon.toFixed(4)}
							&nbsp;·&nbsp; Radius: {(session.radius / 1000).toFixed(1)} km
						</p>
					</div>
					<div class="flex gap-2 shrink-0">
						{#if session.status === 'Active'}
							<a
								href="/game/{session.id}"
								class="bg-orange-600 hover:bg-orange-500 text-white font-semibold py-2 px-4 rounded transition text-sm"
							>
								Play
							</a>
							<button
								on:click={() => markCompleted(session.id)}
								class="bg-neutral-700 hover:bg-neutral-600 text-neutral-300 font-semibold py-2 px-4 rounded transition text-sm"
							>
								Mark Done
							</button>
						{:else}
							<a
								href="/game/{session.id}"
								class="bg-neutral-700 hover:bg-neutral-600 text-neutral-300 font-semibold py-2 px-4 rounded transition text-sm"
							>
								View
							</a>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

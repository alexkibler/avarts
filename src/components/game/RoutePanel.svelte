<script lang="ts">
	import { mapNodes, activeWaypointIds } from '$lib/mapState';
	import { pb } from '$lib/database';
	import { get } from 'svelte/store';
	import { getContext as svelteGetContext, createEventDispatcher } from 'svelte';
	import type { IGameEngine } from '$lib/engine/IGameEngine';

	export let sessionId: string;

	let gameEngine = svelteGetContext<IGameEngine>('gameEngine');
	let locationSwaps = gameEngine.locationSwaps;

	const dispatch = createEventDispatcher<{
		routeToAvailable: void;
		clearRoute: void;
		nodeTap: { node: any };
	}>();

	let expandedAccordion: 'Available' | 'Checked' | 'Hidden' | null = 'Available';

	const accordionStates: ('Available' | 'Checked' | 'Hidden')[] = [
		'Available',
		'Checked',
		'Hidden'
	];

	async function performSwap(node: any) {
		if ($locationSwaps <= 0) {
			alert('No Location Swaps available.');
			return;
		}

		if (
			!confirm(
				`Are you sure you want to swap Check #${node.ap_location_id}? It will be hidden, and a random hidden node will become available.`
			)
		) {
			return;
		}

		const hiddenNodes = $mapNodes.filter((n) => n.state === 'Hidden');
		if (hiddenNodes.length === 0) {
			alert('No hidden nodes available to swap with.');
			return;
		}

		// Pick a random hidden node
		const randomHidden = hiddenNodes[Math.floor(Math.random() * hiddenNodes.length)];

		try {
			// Get fresh session to accurately increment swaps_used
			const session = await pb.collection('game_sessions').getOne(sessionId, { requestKey: null });
			const usedSwaps = session.location_swaps_used || 0;

			await Promise.all([
				pb.collection('map_nodes').update(node.id, { state: 'Hidden' }, { requestKey: null }),
				pb
					.collection('map_nodes')
					.update(randomHidden.id, { state: 'Available' }, { requestKey: null }),
				pb
					.collection('game_sessions')
					.update(sessionId, { location_swaps_used: usedSwaps + 1 }, { requestKey: null })
			]);

			locationSwaps.update((n: number) => Math.max(0, n - 1));
		} catch (e) {
			console.error('Failed to perform location swap:', e);
			alert('Failed to swap location.');
		}
	}
</script>

<div class="route-panel">
	<button on:click={() => dispatch('routeToAvailable')} class="btn-route-available"
		>Route To Available</button
	>
	<button on:click={() => dispatch('clearRoute')} class="btn-clear-route">Clear Route</button>

	<div class="accordions">
		{#each accordionStates as state}
			<div class="accordion">
				<button
					class="accordion-header"
					on:click={() => (expandedAccordion = expandedAccordion === state ? null : state)}
				>
					<div style="display: flex; align-items: center; gap: 8px;">
						<div class="node-pin {state.toLowerCase()}"></div>
						{state} ({$mapNodes.filter((n) => n.state === state).length})
					</div>
					<svg
						style="transform: {expandedAccordion === state
							? 'rotate(180deg)'
							: 'rotate(0)'}; transition: transform 0.2s;"
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg
					>
				</button>
				{#if expandedAccordion === state}
					<div class="accordion-body">
						{#each $mapNodes.filter((n) => n.state === state) as node}
							<!-- svelte-ignore a11y-click-events-have-key-events -->
							<!-- svelte-ignore a11y-no-static-element-interactions -->
							<div
								class="node-item"
								style="cursor: {state === 'Hidden' ? 'default' : 'pointer'}; opacity: {state ===
								'Hidden'
									? 0.5
									: 1}; background: {$activeWaypointIds.has(node.id) ? 'var(--orange-dim)' : ''};"
							>
								<div
									style="display: flex; align-items: center; flex: 1; overflow: hidden;"
									on:click={() => state !== 'Hidden' && dispatch('nodeTap', { node })}
								>
									<span
										style="font-family: 'JetBrains Mono', monospace; font-size: 11px; opacity: 0.7; width: 30px; flex-shrink: 0;"
										>#{node.ap_location_id}</span
									>
									<span
										style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; {$activeWaypointIds.has(
											node.id
										)
											? 'color: var(--orange); font-weight: 500;'
											: ''}"
										title={node.name}>{node.name}</span
									>
									{#if $activeWaypointIds.has(node.id)}
										<svg
											style="color: var(--orange); flex-shrink: 0;"
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg
										>
									{/if}
								</div>
								{#if state === 'Available' && $locationSwaps > 0}
									<button
										class="btn-swap"
										title="Swap this location"
										on:click|stopPropagation={() => performSwap(node)}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline
												points="16 6 12 2 8 6"
											></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg
										>
									</button>
								{/if}
							</div>
						{/each}
						{#if $mapNodes.filter((n) => n.state === state).length === 0}
							<div
								style="padding: 8px 12px; font-size: 11px; color: var(--text-muted); text-align: center;"
							>
								No {state.toLowerCase()} nodes
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.btn-clear-route {
		width: 100%;
		padding: 10px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		color: var(--text-primary);
		font-family: 'Outfit', sans-serif;
		font-size: 13px;
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
		margin-bottom: 8px;
	}
	.btn-clear-route:hover {
		border-color: var(--red);
		color: var(--red);
	}

	.btn-route-available {
		width: 100%;
		padding: 10px;
		background: var(--orange-dim);
		border: 1px solid var(--orange);
		color: var(--orange);
		font-family: 'Outfit', sans-serif;
		font-size: 13px;
		font-weight: 600;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
		margin-bottom: 8px;
	}
	.btn-route-available:hover {
		background: var(--orange);
		color: white;
	}

	.accordions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 16px;
	}
	.accordion {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow: hidden;
	}
	.accordion-header {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		background: none;
		border: none;
		color: var(--text-primary);
		font-family: 'Outfit', sans-serif;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}
	.accordion-header:hover {
		background: var(--bg-hover);
	}
	.accordion-body {
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		max-height: 250px;
		overflow-y: auto;
	}
	.node-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		font-size: 12px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		transition: background 0.15s;
	}
	.node-item:last-child {
		border-bottom: none;
	}
	.node-item:hover {
		background: var(--bg-hover);
	}
	.node-pin {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.node-pin.available {
		background: var(--orange);
	}
	.node-pin.checked {
		background: var(--green);
	}
	.node-pin.hidden {
		background: var(--text-muted);
	}

	.btn-swap {
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: 4px;
		margin-left: 8px;
		transition: all 0.15s;
	}
	.btn-swap:hover {
		color: var(--orange);
		background: rgba(255, 255, 255, 0.05);
	}
</style>

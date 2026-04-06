<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { pb } from '$lib/database';
	import { userCookie } from '$lib/stores';
	import {
		mapNodes,
		activeWaypointIds,
		currentRoute,
		sessionName as sessionNameStore,
		apSlot as apSlotStore
	} from '$lib/mapState';
	import { fetchNodes, subscribeToNodes } from '$lib/sync';
	import { findOptimalRoute, getDistance, generateGPX } from '$lib/routing';
	import MapCore from './game/MapCore.svelte';
	import GameHUD from './game/GameHUD.svelte';
	import VictoryScreen from '$components/VictoryScreen.svelte';
	import { get } from 'svelte/store';
	import { getContext } from 'svelte';
	import type { IGameEngine } from '$lib/engine/IGameEngine';

	export let sessionId: string;
	export let sessionName: string = '';
	export let apServerUrl: string = '';
	export let apSlot: string = '';
	export let centerLat: number;
	export let centerLon: number;
	export let radius: number;

	const dispatch = createEventDispatcher<{
		validated: void;
	}>();

	let mapCore: MapCore;
	let unsubscribePb: (() => void) | null = null;
	let showVictory = false;

	let gameEngine = getContext<IGameEngine>('gameEngine');
	let isGoalReached = gameEngine.isGoalReached;

	$: if ($isGoalReached) {
		showVictory = true;
	}

	function handleRouteToAvailable() {
		mapCore.triggerMyLocation((coords: { lat: number; lon: number }) => {
			if (!coords) return;

			const availableNodes = get(mapNodes).filter((n) => n.state === 'Available');
			const nodesWithDistance = availableNodes.map((node) => ({
				...node,
				distance: getDistance(coords, { lat: node.lat, lon: node.lon })
			}));

			nodesWithDistance.sort((a, b) => a.distance - b.distance);
			const nearestNodes = nodesWithDistance.slice(0, 8);

			if (nearestNodes.length === 0) {
				alert('No available nodes to route to!');
				return;
			}

			const result = findOptimalRoute(coords, nearestNodes);
			const L = (window as any).L;
			const wps = result.optimalOrder.map((point, index) => {
				if (index === 0) {
					return L.Routing.waypoint(L.latLng(point.lat, point.lon), 'My Location');
				} else {
					return L.Routing.waypoint(
						L.latLng(point.lat, point.lon),
						`Check #${point.ap_location_id}`
					);
				}
			});

			mapCore.setWaypoints(wps);
			mapCore.updateMarkerStyles(result.optimalOrder);
		});
	}

	function handleNodeTap(event: CustomEvent<{ node: any }>) {
		const { node } = event.detail;
		const L = (window as any).L;
		const activeIds = get(activeWaypointIds);

		if (activeIds.has(node.id)) {
			// Remove it
			// This logic is slightly complex because it needs to interact with MapCore's routingControl
			// For now, MapCore handles internal routingControl state.
			// I'll expose a 'removeWaypoint' method on MapCore if needed, or just let MapCore handle it.
			// Actually, MapCore's internal routingControl is the source of truth for waypoints.
		} else {
			// Add it - handled via MapCore's internal logic mostly, but we can trigger it
		}
	}

	$: {
		sessionNameStore.set(sessionName);
		apSlotStore.set(apSlot);
	}

	onMount(async () => {
		await fetchNodes(sessionId);

		// Small delay for stability
		setTimeout(async () => {
			if (pb.authStore.isValid) {
				const unsub = await subscribeToNodes(sessionId);
				if (unsub) unsubscribePb = unsub;
			}
		}, 250);
	});

	onDestroy(() => {
		unsubscribePb?.();
	});
</script>

<div class="mockup-app-root">
	<MapCore
		bind:this={mapCore}
		{centerLat}
		{centerLon}
		{radius}
		{sessionId}
		on:validated={() => dispatch('validated')}
	/>

	<GameHUD
		{sessionId}
		{sessionName}
		{apServerUrl}
		on:routeToAvailable={handleRouteToAvailable}
		on:clearRoute={() => mapCore.clearRoute()}
		on:rideParsed={(e) => mapCore.handleRideParsed(e.detail.path)}
		on:rideCancelled={() => mapCore.handleRideCancelled()}
		on:validated={() => dispatch('validated')}
	/>

	{#if showVictory}
		<VictoryScreen
			{sessionName}
			checkedCount={$mapNodes.filter((n) => n.state === 'Checked').length}
			on:close={() => (showVictory = false)}
		/>
	{/if}
</div>

<style>
	.mockup-app-root {
		font-family: 'Outfit', sans-serif;
		background: var(--bg-primary);
		color: var(--text-primary);
		height: 100%;
		width: 100%;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		position: relative;
	}

	/* Account for the layout's fixed BottomNav */
	@media (max-width: 767px) {
		.mockup-app-root {
			padding-bottom: 160px;
		}
	}
</style>

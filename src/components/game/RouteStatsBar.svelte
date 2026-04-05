<script lang="ts">
	import { routeDistance, elevationGain, currentRoute } from '$lib/mapState';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher<{
		exportToGPX: void;
	}>();
</script>

<div class="route-stats">
	<div class="elevation-graph-container">
		<div id="elevation-container"></div>
	</div>

	<div class="bottom-row-mobile">
		<div class="stats-container">
			<div class="stat">
				<span class="stat-label">Distance</span>
				<span class="stat-value"
					>{($routeDistance / 1000).toFixed(2)}<span class="unit">km</span></span
				>
			</div>
			<div class="stat">
				<span class="stat-label">Elev Gain</span>
				<span class="stat-value"
					>{($elevationGain * 0.6).toFixed(2)}<span class="unit">m</span></span
				>
			</div>
		</div>

		<button
			on:click={() => dispatch('exportToGPX')}
			disabled={!$currentRoute}
			class="btn-export mobile-hud-export"
			style="opacity: {$currentRoute ? 1 : 0.4}; cursor: {$currentRoute
				? 'pointer'
				: 'not-allowed'}"
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
				style="margin-right: 4px; display: inline-block; vertical-align: middle;"
				><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline
					points="7 10 12 15 17 10"
				></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg
			>
			Download GPX
		</button>
	</div>
</div>

<style>
	.route-stats {
		background: var(--bg-surface);
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		padding: 12px 16px;
		gap: 12px;
		flex-shrink: 0;
		position: relative;
		z-index: 10;
	}

	.stats-container {
		display: flex;
		gap: 24px;
		flex-shrink: 0;
	}

	.stat {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex-shrink: 0;
		justify-content: center;
	}
	.stat .stat-label {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
		line-height: 1;
		margin-bottom: 2px;
	}
	.stat .stat-value {
		font-size: 16px;
		font-weight: 600;
		white-space: nowrap;
	}
	.stat .stat-value .unit {
		font-size: 11px;
		font-weight: 400;
		color: var(--text-secondary);
		margin-left: 2px;
	}

	.elevation-graph-container {
		width: 100%;
		height: 80px;
		min-height: 80px;
		max-height: 80px;
		display: flex;
		align-items: center;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		overflow: hidden;
	}

	#elevation-container {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	/* Override internal leaflet-elevation styles when detached */
	:global(#elevation-container .elevation-control) {
		margin: 0 !important;
		border: none !important;
		background: transparent !important;
		height: 100% !important;
	}
	:global(#elevation-container .elevation-control .background) {
		background-color: transparent !important;
	}

	.btn-export {
		background: var(--orange);
		color: white;
		border: none;
		font-family: 'Outfit', sans-serif;
		font-size: 12px;
		font-weight: 600;
		padding: 8px 16px;
		border-radius: 6px;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
		transition: filter 0.15s;
		display: flex;
		align-items: center;
	}
	.btn-export:hover {
		filter: brightness(1.1);
	}

	.bottom-row-mobile {
		display: flex;
		flex: 1;
		justify-content: space-between;
		align-items: center;
	}

	@media (max-width: 600px) {
		.route-stats {
			padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
		}
		.stats-container {
			gap: 12px;
		}
		.stat .stat-value {
			font-size: 13px;
		}
		.btn-export {
			padding: 8px 12px;
			font-size: 12px;
		}
	}
</style>

<script lang="ts">
	import { routeDistance, elevationGain, currentRoute, sessionName, apSlot } from '$lib/mapState';
	import { generateGPX, getDistance } from '$lib/routing';
	import { userCookie } from '$lib/stores';
	import { get } from 'svelte/store';

	export let isSmall = false;

	function handleExport() {
		const routeData = get(currentRoute);
		if (routeData) {
			const user = get(userCookie)?.user;
			const sName = get(sessionName);
			const slot = get(apSlot);

			const gpxData = generateGPX(
				routeData,
				user?.name || 'Player',
				user?.id || '',
				sName || 'Game Session',
				slot || 'Player'
			);

			const blob = new Blob([gpxData], { type: 'application/gpx+xml' });
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			const combinedName = `${sName || 'Session'}_${slot || 'Route'}`.replace(/\s+/g, '_');
			link.download = `${combinedName}.gpx`;
			link.click();
			window.URL.revokeObjectURL(url);
		}
	}

	$: isVisible = !!$currentRoute;

	// Custom Elevation Chart Logic
	$: chartData = (() => {
		if (!$currentRoute || !$currentRoute.coordinates || $currentRoute.coordinates.length < 2)
			return null;

		const coords = $currentRoute.coordinates;
		let cumulativeDist = 0;
		const points = coords.map((c, i) => {
			if (i > 0) {
				const prev = coords[i - 1];
				cumulativeDist += getDistance({ lat: prev.lat, lon: prev.lng }, { lat: c.lat, lon: c.lng });
			}
			return {
				x: cumulativeDist,
				y: c.meta?.elevation || 0
			};
		});

		const xMax = points[points.length - 1].x || 1;
		const yValues = points.map((p) => p.y);
		const yMin = Math.min(...yValues);
		const yMax = Math.max(...yValues);
		const yRange = yMax - yMin || 1;

		// Normalize to 100x100 for SVG
		const normalizedPoints = points.map((p) => ({
			x: (p.x / xMax) * 100,
			y: 100 - ((p.y - yMin) / yRange) * 80 - 10 // Leave 10% padding top/bottom
		}));

		const pathData = normalizedPoints
			.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
			.join(' ');
		const areaData = `${pathData} L 100 100 L 0 100 Z`;

		return { pathData, areaData };
	})();
</script>

<div class="route-stats" class:visible={isVisible} class:small={isSmall}>
	<div class="elevation-graph-container">
		{#if chartData}
			<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="elevation-chart">
				<path d={chartData.areaData} class="chart-area" />
				<path d={chartData.pathData} class="chart-line" />
			</svg>
		{:else}
			<div class="no-data">No elevation data</div>
		{/if}
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
			on:click={handleExport}
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
		width: 100%;
		background: var(--bg-surface);
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		padding: 12px 16px;
		gap: 12px;
		flex-shrink: 0;
		z-index: 1000;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.2s;
	}

	@media (min-width: 601px) {
		.route-stats {
			position: absolute;
			bottom: 0;
			right: 0;
			width: var(--panel-w);
		}
	}

	.route-stats.visible {
		opacity: 1;
		pointer-events: auto;
	}

	.route-stats.small {
		padding: 8px 12px;
		gap: 8px;
	}

	.route-stats.small .elevation-graph-container {
		height: 40px;
		min-height: 40px;
	}

	@media (min-width: 601px) {
		.route-stats {
			position: absolute;
			bottom: 0;
			right: 0;
		}
		.route-stats.visible {
			width: var(--panel-w);
			box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
		}
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
		letter-spacing: 0.8px;
		color: #ffffff;
		opacity: 0.9;
		font-weight: 700;
		line-height: 1;
		margin-bottom: 4px;
	}
	.stat .stat-value {
		font-size: 16px;
		font-weight: 600;
		color: #ffffff;
		white-space: nowrap;
	}
	.stat .stat-value .unit {
		font-size: 11px;
		font-weight: 500;
		color: #ffffff;
		opacity: 0.8;
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

	.elevation-chart {
		width: 100%;
		height: 100%;
		display: block;
	}

	.chart-line {
		fill: none;
		stroke: var(--orange);
		stroke-width: 1.25;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.chart-area {
		fill: var(--orange);
		fill-opacity: 0.15;
		stroke: none;
	}

	.no-data {
		width: 100%;
		text-align: center;
		font-size: 12px;
		color: var(--text-muted);
		font-style: italic;
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

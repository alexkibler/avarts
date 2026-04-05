<script lang="ts">
	import { nodeStats } from '$lib/mapState';
	import { getContext } from 'svelte';
	import type { IGameEngine } from '$lib/engine/IGameEngine';

	export let sessionName: string = '';
	export let apServerUrl: string = '';

	let gameEngine = getContext<IGameEngine>('gameEngine');
	let locationSwaps = gameEngine.locationSwaps;
</script>

<div class="topnav">
	<div class="status-pill expanded" style="cursor: default;">
		<div class="connected-dot"></div>
		<span class="seed-label">{sessionName || 'Game Session'} • {apServerUrl || 'localhost'}</span>
	</div>

	<div class="status-counters">
		<div class="counter {$nodeStats.hidden === 0 ? 'hidden' : ''}">
			<span class="num">{$nodeStats.hidden}</span> <span class="lbl">Hidden</span>
		</div>
		<div class="counter available">
			<span class="num">{$nodeStats.available}</span> <span class="lbl">Available</span>
		</div>
		<div class="counter checked">
			<span class="num">{$nodeStats.checked}</span> <span class="lbl">Checked</span>
		</div>
		{#if $locationSwaps > 0}
			<div class="counter available">
				<span class="num">{$locationSwaps}</span> <span class="lbl">Swaps</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.topnav {
		height: var(--topnav-h);
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: center;
		padding: 0 12px;
		gap: 12px;
		flex-shrink: 0;
		flex-wrap: nowrap;
		overflow: hidden;
		z-index: 100;
	}

	.status-pill {
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 4px 10px;
		font-size: 12px;
		cursor: pointer;
		position: relative;
		transition: border-color 0.2s;
		min-width: 0;
	}

	.status-pill .connected-dot {
		width: 6px;
		height: 6px;
		background: var(--green);
		border-radius: 50%;
		flex-shrink: 0;
		box-shadow: 0 0 6px var(--green);
	}

	.status-pill .seed-label {
		color: var(--text-primary);
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.status-counters {
		display: flex;
		gap: 10px;
		font-size: 11px;
		margin-left: auto;
		flex-shrink: 0;
	}

	.counter {
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.counter .num {
		font-weight: 600;
		font-family: 'JetBrains Mono', monospace;
		font-size: 12px;
	}

	.counter .lbl {
		color: var(--text-muted);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.counter.hidden .num {
		color: var(--text-secondary);
	}

	.counter.available .num {
		color: var(--green);
	}

	.counter.checked .num {
		color: var(--orange);
	}

	@media (max-width: 600px) {
		.status-counters .lbl {
			display: none;
		}
	}

	@media (max-width: 380px) {
		.status-pill .seed-label {
			font-size: 11px;
		}
		.counter .num {
			font-size: 11px;
		}
	}
</style>

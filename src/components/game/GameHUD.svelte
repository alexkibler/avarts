<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { activeGameTab } from '$lib/stores';
	import { nodeStats } from '$lib/mapState';
	import { getContext } from 'svelte';
	import type { IGameEngine } from '$lib/engine/IGameEngine';
	import ChatClient from '$components/ChatClient.svelte';
	import ApDropzone from '$components/apDropzone.svelte';
	import RoutePanel from './RoutePanel.svelte';
	import TopNav from './TopNav.svelte';
	import RouteStatsBar from './RouteStatsBar.svelte';

	export let sessionId: string;
	export let sessionName: string = '';
	export let apServerUrl: string = '';

	const dispatch = createEventDispatcher<{
		routeToAvailable: void;
		clearRoute: void;
		nodeTap: { node: any };
		exportToGPX: void;
		validated: void;
		rideParsed: { path: any[] };
		rideCancelled: void;
	}>();

	let panelOpen = false;
	let activeTab: 'chat' | 'upload' | 'route' = 'chat';

	$: {
		if ($activeGameTab) {
			activeTab = $activeGameTab;
			panelOpen = true;
		} else {
			panelOpen = false;
		}
	}

	function closePanel() {
		activeGameTab.set(null);
	}
</script>

<div class="game-hud">
	<TopNav {sessionName} {apServerUrl} />

	<div class="main-hud-area">
		<!-- PANEL OVERLAY & PANEL -->
		{#if panelOpen}
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div
				class="panel-overlay open"
				on:click={closePanel}
				on:keydown={(e) => e.key === 'Escape' && closePanel()}
			></div>
			<div class="panel">
				<div class="panel-header">
					<div class="panel-title">
						{#if activeTab === 'chat'}Chat
						{:else if activeTab === 'upload'}Upload .fit
						{:else}Route Builder{/if}
					</div>
					<button class="panel-close" on:click={closePanel}>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"
							></line></svg
						>
					</button>
				</div>
				<div class="panel-body">
					{#if activeTab === 'chat'}
						<ChatClient />
					{:else if activeTab === 'upload'}
						<ApDropzone
							{sessionId}
							on:validated={() => dispatch('validated')}
							on:rideParsed={(e) => dispatch('rideParsed', e.detail)}
							on:rideCancelled={() => dispatch('rideCancelled')}
						/>
					{:else if activeTab === 'route'}
						<RoutePanel
							{sessionId}
							on:routeToAvailable={() => dispatch('routeToAvailable')}
							on:clearRoute={() => dispatch('clearRoute')}
							on:nodeTap={(e) => dispatch('nodeTap', e.detail)}
						/>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<RouteStatsBar on:exportToGPX={() => dispatch('exportToGPX')} />
</div>

<style>
	.game-hud {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		pointer-events: none;
		z-index: 1000;
	}

	.main-hud-area {
		flex: 1;
		position: relative;
		overflow: hidden;
	}

	.game-hud > :global(*) {
		pointer-events: auto;
	}

	.panel-overlay {
		position: absolute;
		inset: 0;
		z-index: 50;
		background: rgba(0, 0, 0, 0.3);
		display: none;
	}
	.panel-overlay.open {
		display: block;
	}

	.panel {
		position: absolute;
		top: 0;
		right: 0;
		width: var(--panel-w);
		height: 100%;
		background: var(--bg-surface);
		border-left: 1px solid var(--border);
		pointer-events: auto;
		display: flex;
		flex-direction: column;
		box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
		animation: slideIn 0.25s ease-out;
		z-index: 100;
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
		}
		to {
			transform: translateX(0);
		}
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.panel-title {
		font-size: 14px;
		font-weight: 600;
	}
	.panel-close {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.15s;
	}

	.panel-body {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
	}

	@media (max-width: 600px) {
		.panel {
			width: 100%;
			border-left: none;
		}
	}
</style>

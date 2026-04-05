<script lang="ts">
	import { page } from '$app/stores';
	import { activeGameTab } from '$lib/stores';
	import { onMount } from 'svelte';
	import RouteStatsBar from './game/RouteStatsBar.svelte';
	import { currentRoute } from '$lib/mapState';

	$: pathname = $page.url.pathname;
	$: isGamePage = pathname.startsWith('/game/');

	function handleTab(tab: 'chat' | 'upload' | 'route' | null) {
		activeGameTab.update((current) => (current === tab ? null : tab));
	}

	// Clear tab on navigation
	$: {
		if (!isGamePage) {
			activeGameTab.set(null);
		}
	}
</script>

<div
	class="fixed bottom-0 left-0 right-0 z-[2000] border-t border-white/10 bg-neutral-900/80 backdrop-blur-md px-0 pb-safe pt-0 md:hidden"
>
	{#if isGamePage && $currentRoute}
		<RouteStatsBar isSmall={true} />
	{/if}

	<div class="mx-auto flex max-w-lg items-center justify-around px-4 pt-2">
		{#if isGamePage}
			<!-- Game Mode Navigation -->
			<a
				href="/"
				class="flex flex-col items-center gap-1 p-2 text-neutral-400 transition-colors hover:text-orange-500"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline
						points="9 22 9 12 15 12 15 22"
					/></svg
				>
				<span class="text-[10px] font-bold uppercase tracking-wider">Home</span>
			</a>

			<button
				on:click={() => handleTab('chat')}
				class="flex flex-col items-center gap-1 p-2 transition-colors {$activeGameTab === 'chat'
					? 'text-orange-500'
					: 'text-neutral-400 hover:text-orange-500'}"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg
				>
				<span class="text-[10px] font-bold uppercase tracking-wider">Chat</span>
			</button>

			<button
				on:click={() => handleTab('upload')}
				class="flex flex-col items-center gap-1 p-2 transition-colors {$activeGameTab === 'upload'
					? 'text-orange-500'
					: 'text-neutral-400 hover:text-orange-500'}"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
						points="17 8 12 3 7 8"
					/><line x1="12" x2="12" y1="3" y2="15" /></svg
				>
				<span class="text-[10px] font-bold uppercase tracking-wider">Upload</span>
			</button>

			<button
				on:click={() => handleTab('route')}
				class="flex flex-col items-center gap-1 p-2 transition-colors {$activeGameTab === 'route'
					? 'text-orange-500'
					: 'text-neutral-400 hover:text-orange-500'}"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" /><path d="M9 3v15" /><path
						d="M15 6v15"
					/></svg
				>
				<span class="text-[10px] font-bold uppercase tracking-wider">Route</span>
			</button>
		{:else}
			<!-- Standard Mode Navigation -->
			<a
				href="/"
				class="flex flex-col items-center gap-1 p-2 transition-colors {pathname === '/'
					? 'text-orange-500'
					: 'text-neutral-400 hover:text-orange-500'}"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline
						points="9 22 9 12 15 12 15 22"
					/></svg
				>
				<span class="text-[10px] font-bold uppercase tracking-wider">Home</span>
			</a>

			<a
				href="/game"
				class="flex flex-col items-center gap-1 p-2 transition-colors {pathname.startsWith('/game')
					? 'text-orange-500'
					: 'text-neutral-400 hover:text-orange-500'}"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5" /><path
						d="M4 19a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4Z"
					/><path d="M6 15v-2" /><path d="M10 15v-2" /><path d="M14 15v-2" /><path
						d="M18 15v-2"
					/></svg
				>
				<span class="text-[10px] font-bold uppercase tracking-wider">Play</span>
			</a>

			<a
				href="/yaml-creator"
				class="flex flex-col items-center gap-1 p-2 transition-colors {pathname === '/yaml-creator'
					? 'text-orange-500'
					: 'text-neutral-400 hover:text-orange-500'}"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path
						d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
					/></svg
				>
				<span class="text-[10px] font-bold uppercase tracking-wider">Create</span>
			</a>
		{/if}
	</div>
</div>

<style>
	/* Support for iOS safe area (notch) */
	.pb-safe {
		padding-bottom: env(safe-area-inset-bottom, 0);
	}
</style>

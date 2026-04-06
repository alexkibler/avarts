<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { createEventDispatcher } from 'svelte';

	export let show = false;
	export let type: 'resume' | 'collision' = 'resume';
	export let sessionId: string = '';

	const dispatch = createEventDispatcher();

	function close() {
		dispatch('close');
	}

	function resume() {
		if (sessionId) {
			window.location.href = `/game/${sessionId}`;
		}
		dispatch('resume');
	}
</script>

{#if show}
	<div
		class="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
		transition:fade={{ duration: 200 }}
	>
		<div
			class="bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
			transition:scale={{ duration: 200, start: 0.95 }}
		>
			<div class="p-6">
				{#if type === 'resume'}
					<div class="flex items-center gap-4 mb-4 text-orange-500">
						<div class="p-3 bg-orange-500/10 rounded-full">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="w-6 h-6"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<circle cx="12" cy="12" r="10" />
								<polyline points="12 6 12 12 16 14" />
							</svg>
						</div>
						<h3 class="text-xl font-bold text-white">Existing Session Found</h3>
					</div>

					<p class="text-neutral-300 mb-6 leading-relaxed">
						You already have an active session for this Archipelago seed. Multiple users cannot
						share the same seed in this system. Would you like to resume your previous progress?
					</p>

					<div class="flex flex-col gap-3">
						<button
							class="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-orange-900/20 active:scale-[0.98]"
							on:click={resume}
						>
							Resume Session
						</button>
						<button
							class="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium py-3 rounded-lg border border-neutral-700 transition active:scale-[0.98]"
							on:click={close}
						>
							Cancel
						</button>
					</div>
				{:else}
					<div class="flex items-center gap-4 mb-4 text-red-500">
						<div class="p-3 bg-red-500/10 rounded-full">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="w-6 h-6"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
								<path d="M7 11V7a5 5 0 0 1 10 0v4" />
							</svg>
						</div>
						<h3 class="text-xl font-bold text-white">Access Denied</h3>
					</div>

					<p class="text-neutral-300 mb-6 leading-relaxed">
						This Archipelago seed is already in use by another user. To protect user privacy and
						session isolation, you cannot join or create a session with a seed that is already
						claimed.
					</p>

					<div class="flex flex-col gap-3">
						<button
							class="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-medium py-3 rounded-lg border border-neutral-700 transition active:scale-[0.98]"
							on:click={close}
						>
							Close
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

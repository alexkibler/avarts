<script lang="ts">
	import { onMount } from 'svelte';
	import confetti from 'canvas-confetti';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	export let sessionName: string = '';
	export let checkedCount: number = 0;

	onMount(() => {
		const duration = 5 * 1000;
		const animationEnd = Date.now() + duration;
		const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

		function randomInRange(min: number, max: number) {
			return Math.random() * (max - min) + min;
		}

		const interval: any = setInterval(function () {
			const timeLeft = animationEnd - Date.now();

			if (timeLeft <= 0) {
				return clearInterval(interval);
			}

			const particleCount = 50 * (timeLeft / duration);
			// since particles fall down, start a bit higher than random
			confetti({
				...defaults,
				particleCount,
				origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
			});
			confetti({
				...defaults,
				particleCount,
				origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
			});
		}, 250);

		return () => clearInterval(interval);
	});
</script>

<div
	class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
>
	<div
		class="bg-neutral-800 border-2 border-orange-500 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center transform animate-bounce-in"
	>
		<div class="text-6xl mb-4">🏆</div>
		<h1 class="text-4xl font-black text-white mb-2 tracking-tighter">GOAL REACHED!</h1>
		<p class="text-orange-400 font-bold text-xl mb-6 uppercase tracking-widest">
			{sessionName || 'Seed'} Completed
		</p>

		<div class="bg-neutral-900 rounded-xl p-6 mb-8 border border-neutral-700">
			<p class="text-neutral-400 text-sm uppercase font-bold mb-1">Total Intersections Checked</p>
			<p class="text-5xl font-mono text-white">{checkedCount}</p>
		</div>

		<button
			on:click={() => dispatch('close')}
			class="w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-4 rounded-xl text-xl transition-all active:scale-95 shadow-lg hover:shadow-orange-500/20"
		>
			HELL YEAH
		</button>
	</div>
</div>

<style>
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes bounce-in {
		0% {
			transform: scale(0.3);
			opacity: 0;
		}
		50% {
			transform: scale(1.05);
			opacity: 1;
		}
		70% {
			transform: scale(0.9);
		}
		100% {
			transform: scale(1);
		}
	}

	.animate-fade-in {
		animation: fade-in 0.5s ease-out forwards;
	}

	.animate-bounce-in {
		animation: bounce-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
	}
</style>

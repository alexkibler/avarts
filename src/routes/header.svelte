<script lang="ts">
	import { page } from '$app/stores';
	import { env } from '$env/dynamic/public';
	import type { UserData } from '$lib/types';

	export let data: UserData;
	export let isGamePage: boolean = false;

	let url: string;
	if (env.PUBLIC_DB_URL) {
		url = env.PUBLIC_DB_URL;
	} else {
		url = 'http://127.0.0.1:8090';
	}
</script>

<nav class="max-w-screen-xl h-12 mx-auto flex items-center justify-between px-4">
	<div class="flex items-center">
		<a href="/" class="flex items-center">
			<img
				class="text-orange-600 uppercase font-extrabold text-2xl h-5 w-32"
				src="/bikeapelago.svg"
				alt="Bikeapelago"
			/>
		</a>
	</div>

	{#if data.user}
		<div class="flex items-center gap-4">
			<span
				class="hidden text-sm font-medium text-neutral-300 sm:block"
				>{data.user.name || data.user.username}</span
			>
		</div>
	{/if}
</nav>

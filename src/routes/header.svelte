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
			<a href="/athlete" class="group flex items-center gap-2">
				{#if data.user.avatar}
					<img
						src="{url}/api/files/{data.user.collectionId}/{data.user.id}/{data.user.avatar}"
						alt="avatar"
						class="h-8 w-8 rounded-full border border-neutral-600 object-cover shadow-sm transition-transform group-hover:scale-105"
					/>
				{:else}
					<img
						src="/avatar.svg"
						alt="avatar"
						class="h-8 w-8 rounded-full border border-neutral-600 object-cover shadow-sm transition-transform group-hover:scale-105"
					/>
				{/if}
				<span
					class="hidden text-sm font-medium text-neutral-300 group-hover:text-white transition-colors sm:block"
					>{data.user.name || data.user.username}</span
				>
			</a>
		</div>
	{/if}
</nav>

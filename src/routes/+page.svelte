<script lang="ts">
	import { afterUpdate, onMount } from 'svelte';
	import { pb } from '$lib/database';
	import { env } from '$env/dynamic/public';

	export let data;
	export let form;
	let username: string,
		name: string,
		password: string = '',
		confirm: string;
	let ready: boolean = true;

	let register = false;
	function ifRegister() {
		if (register == false) {
			register = true;
		} else {
			register = false;
		}
	}
</script>

{#if !ready}
	<p class="ml-5 mt-10 text-white text-2xl">Loading activities...</p>
{/if}

{#if data.user}
	<div class="flex justify-center min-h-screen bg-neutral-900/50">
		{#if ready}
			<div class="flex flex-col w-full max-w-4xl mt-8 mx-8 lg:mx-0">
				{#if data.gameSessions && data.gameSessions.length > 0}
					<div class="mb-12">
						<header class="mb-8 text-center">
							<h2
								class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-500 text-xs font-bold uppercase tracking-[0.2em]"
							>
								<span class="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span>
								Active Game Sessions
							</h2>
						</header>

						<div class="grid gap-6">
							{#each data.gameSessions as session}
								<div
									class="group relative overflow-hidden bg-neutral-800/40 backdrop-blur-md border border-white/5 rounded-2xl p-6 hover:border-orange-500/40 transition-all duration-500 hover:translate-y-[-2px] hover:shadow-2xl hover:shadow-orange-500/10"
								>
									<div
										class="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
									></div>

									<div class="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
										<div class="flex-1 min-w-0">
											<div class="flex items-center gap-3 mb-3">
												<h3 class="text-xl text-white font-bold tracking-tight truncate">
													{session.ap_seed_name || 'Untitled Seed'}
												</h3>
												<span
													class="px-2 py-0.5 rounded-md text-[10px] font-black bg-orange-500 text-white uppercase tracking-tighter"
												>
													AP Mode
												</span>
											</div>

											<div class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-400">
												<div class="flex items-center gap-2 group/info">
													<div class="p-1.5 rounded-lg bg-white/5 text-neutral-500 group-hover/info:text-orange-400 transition-colors">
														<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
													</div>
													<span class="truncate max-w-[200px] font-medium">{session.ap_server_url}</span>
												</div>
												<div class="flex items-center gap-2 group/info">
													<div class="p-1.5 rounded-lg bg-white/5 text-neutral-500 group-hover/info:text-orange-400 transition-colors">
														<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
													</div>
													<span class="font-medium">{session.ap_slot_name}</span>
												</div>
											</div>
										</div>

										<a href="/game/{session.id}" class="w-full md:w-auto shrink-0 transition-transform active:scale-95">
											<button
												class="w-full md:w-auto bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-orange-900/20 hover:shadow-orange-500/30 flex items-center justify-center gap-2 group/btn"
											>
												Resume Session
												<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover/btn:translate-x-1 transition-transform"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
											</button>
										</a>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<div
						class="mt-20 bg-neutral-800/30 backdrop-blur-sm p-12 rounded-3xl text-center border border-white/5 shadow-2xl relative overflow-hidden group"
					>
						<div class="absolute inset-0 bg-gradient-to-b from-orange-500/5 to-transparent"></div>
						<div class="relative">
							<div class="w-20 h-20 bg-orange-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-orange-500/20 group-hover:scale-110 transition-transform duration-500">
								<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7"/><path d="M16 19h6"/><path d="M19 16v6"/><circle cx="9" cy="9" r="2"/></svg>
							</div>
							<h2 class="text-white text-3xl font-black mb-4 tracking-tight">No Active Sessions</h2>
							<p class="text-neutral-400 mb-10 max-w-sm mx-auto leading-relaxed">
								You haven't started any Archipelago games yet. Connect to a multiworld server to track your progress and plan routes.
							</p>
							<a href="/setup-session" class="inline-block transition-transform active:scale-95">
								<button
									class="px-10 py-4 bg-orange-600 text-white font-black rounded-xl hover:bg-orange-500 transition-all shadow-xl shadow-orange-900/30 hover:shadow-orange-500/40 uppercase tracking-widest text-sm flex items-center gap-3"
								>
									Start Your First Game
									<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
								</button>
							</a>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{:else}
	<div class="flex grow">
		<div class="mx-auto mt-20 h-20">
			{#if env.PUBLIC_REGISTRATION == 'true' || env.PUBLIC_REGISTRATION == undefined}
				<button
					on:click={ifRegister}
					class="mb-2 p-1 rounded-xl bg-orange-600 text-white hover:bg-orange-700 w-20"
				>
					{#if !register}
						register
					{:else}
						login
					{/if}
				</button>
			{/if}
			{#if !register}
				{#if form?.login}
					<div class="flex w-full items-center justify-center">
						<p class="text-red-600">Incorrect credentials</p>
					</div>
				{/if}
				<form action="?/login" method="POST" class="flex flex-col items-center w-full">
					<div class="w-full mb-5">
						<label for="username" class="pb-1 text-white">
							<span>username</span>
						</label>
						<input type="text" name="username" class="w-full border p-2 rounded-xl" />
					</div>
					<div class="w-full mb-5">
						<label for="password" class="pb-1 text-white">
							<span>Password</span>
						</label>
						<input type="password" name="password" class="w-full border p-2 rounded-xl" />
					</div>
					<div>
						<!-- submit the form -->
						<button
							type="submit"
							class="mx-auto p-2 rounded-xl bg-orange-600 text-white hover:bg-orange-700"
							>Login</button
						>
					</div>
				</form>
			{:else}
				<form action="?/register" method="POST" class="flex flex-col items-center w-full">
					<!-- if form exist and and email is true -->
					{#if form?.email}
						<div class="flex w-full items-center justify-center mb-2 text-center flex-col">
							<p class="text-red-600">Registration failed.</p>
							{#if form?.error}
								<p class="text-red-500 text-sm">{form.error}</p>
							{/if}
						</div>
					{/if}
					<div class="w-full mb-5">
						<label for="username" class="pb-1 text-white">
							<span>Username</span>
						</label>
						<input
							bind:value={username}
							type="text"
							name="username"
							class="w-full border p-2 rounded-xl"
						/>
					</div>
					<div class="w-full mb-5">
						<label for="name" class="pb-1 text-white">
							<span>Name</span>
						</label>
						<input bind:value={name} type="text" name="name" class="w-full border p-2 rounded-xl" />
					</div>
					<div class="w-full mb-5">
						{#if password != '' && password.length < 8}
							<div class="flex justify-center items-center w-full">
								<p class="text-red-600">Password needs to at least 8 characters long</p>
							</div>
						{/if}
						<label for="password" class="pb-1 text-white">
							<span>Password</span>
						</label>
						<input
							bind:value={password}
							type="password"
							name="password"
							class="w-full border p-2 rounded-xl"
						/>
					</div>
					{#if password != '' && password != confirm}
						<p class="text-red-600">Passwords do not match</p>
					{/if}
					<div class="w-full mb-5">
						<label for="password" class="pb-1 text-white">
							<span>Verify Password</span>
						</label>
						<input
							bind:value={confirm}
							type="password"
							name="passwordConfirm"
							class="w-full border p-2 rounded-xl"
						/>
					</div>
					<div>
						<!-- submit the form -->
						<div
							style={username != undefined &&
							name != undefined &&
							password != undefined &&
							confirm != undefined &&
							confirm == password &&
							password.length >= 8
								? ''
								: 'cursor: not-allowed;'}
						>
							<button
								type="submit"
								class="mx-auto p-2 rounded-xl bg-orange-600 text-white hover:bg-orange-700"
								style={username != undefined &&
								name != undefined &&
								password != undefined &&
								confirm != undefined &&
								confirm == password &&
								password.length >= 8
									? ''
									: 'pointer-events: none;'}>Register</button
							>
						</div>
					</div>
				</form>
			{/if}
		</div>
	</div>
{/if}

<style>
</style>

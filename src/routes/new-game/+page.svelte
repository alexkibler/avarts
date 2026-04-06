<script lang="ts">
	import { userCookie } from '$lib/stores';
	import SessionDialog from '../../components/SessionDialog.svelte';

	// Form Data
	let slotName = '';
	let serverUrl = 'archipelago.gg:';
	let password = '';
	let gameMode: 'archipelago' | 'singleplayer' = 'archipelago';

	let isConnecting = false;
	let errorMsg = '';

	// Existing session detection
	let showSessionDialog = false;
	let sessionDialogType: 'resume' | 'collision' = 'resume';
	let existingSessionId = '';

	async function handleSubmit() {
		isConnecting = true;
		errorMsg = '';

		try {
			if (gameMode === 'archipelago') {
				// 1. Connect to Archipelago
				const response = await fetch('/api/ap/connect', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						serverUrl,
						slotName,
						password
					})
				});

				if (!response.ok) {
					const errorData = await response.json();
					throw new Error(errorData.message || 'Failed to connect to Archipelago.');
				}

				const apData = await response.json();
				const seedId = apData.roomInfo?.seed_name;

				if (!seedId) {
					throw new Error('Archipelago connection successful but no seed name returned.');
				}

				// 2. Check if a session already exists for this AP seed
				const userId = $userCookie?.user?.id;
				if (!userId) {
					throw new Error('Must be logged in to create or join a game session.');
				}

				const checkResponse = await fetch(`/api/ap/check-session?seedId=${seedId}`);
				if (!checkResponse.ok) {
					const errorData = await checkResponse.json().catch(() => ({}));
					throw new Error(
						errorData.message || 'Failed to verify session availability. Please try again later.'
					);
				}

				const checkData = await checkResponse.json();

				if (checkData.exists) {
					existingSessionId = checkData.sessionId;
					sessionDialogType = checkData.isOwner ? 'resume' : 'collision';
					showSessionDialog = true;
					isConnecting = false;
					return;
				}

				// No existing session, proceed to setup
				window.location.href = `/setup-session/${seedId}?serverUrl=${encodeURIComponent(
					serverUrl
				)}&slotName=${encodeURIComponent(slotName)}&password=${encodeURIComponent(password)}`;
			} else {
				// Singleplayer: redirect to setup-session
				const seedId = `singleplayer-${Date.now()}`;
				window.location.href = `/setup-session/${seedId}?mode=singleplayer`;
			}
		} catch (err) {
			isConnecting = false;
			console.error('[New Game Error]', err);
			errorMsg = (err as Error).message || 'An error occurred.';
		}
	}
</script>

<svelte:head>
	<title>New Bikeapelago Game</title>
</svelte:head>

<div class="p-6 text-white max-w-2xl mx-auto">
	<div class="bg-neutral-800 p-6 rounded-lg shadow-lg">
		<h1 class="text-3xl font-bold mb-6 text-orange-500">Create New Game</h1>

		<form on:submit|preventDefault={handleSubmit} class="space-y-4">
			<fieldset>
				<legend class="block text-sm font-medium mb-1">Game Mode</legend>
				<div class="flex gap-4">
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="radio"
							name="mode"
							value="archipelago"
							bind:group={gameMode}
							class="text-orange-500 focus:ring-orange-500"
						/>
						<span>Archipelago Multiworld</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="radio"
							name="mode"
							value="singleplayer"
							bind:group={gameMode}
							class="text-orange-500 focus:ring-orange-500"
						/>
						<span>Single Player</span>
					</label>
				</div>
			</fieldset>

			{#if gameMode === 'archipelago'}
				<div>
					<label class="block text-sm font-medium mb-1" for="serverUrl">Server URL</label>
					<input
						id="serverUrl"
						bind:value={serverUrl}
						required
						class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium mb-1" for="slotName">Slot Name</label>
					<input
						id="slotName"
						bind:value={slotName}
						required
						class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium mb-1" for="password">Password (Optional)</label>
					<input
						id="password"
						bind:value={password}
						class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500"
					/>
				</div>
			{/if}

			<div class="pt-4">
				<button
					type="submit"
					disabled={isConnecting}
					class="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-4 rounded transition disabled:opacity-50"
				>
					{#if gameMode === 'archipelago'}
						{isConnecting ? 'Connecting...' : 'Connect & Play'}
					{:else}
						{isConnecting ? 'Loading...' : 'Continue to Setup'}
					{/if}
				</button>
			</div>

			{#if errorMsg}
				<div class="mt-4 p-3 bg-red-900/50 border border-red-500 text-red-200 rounded">
					{errorMsg}
				</div>
			{/if}
		</form>
	</div>
</div>

<!-- Session Management Dialogs -->
<SessionDialog
	show={showSessionDialog}
	type={sessionDialogType}
	sessionId={existingSessionId}
	on:close={() => {
		showSessionDialog = false;
		isConnecting = false;
	}}
/>

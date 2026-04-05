<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { analyzeFitFile, commitValidation, type RideSummary } from '$lib/validation';

	export let sessionId: string;

	const dispatch = createEventDispatcher();

	let isHovering = false;
	let file: File | null = null;
	let validationMessages: string[] = [];
	let isProcessing = false;
	let summary: RideSummary | null = null;

	const handleDragOver = (e: DragEvent) => {
		e.preventDefault();
		isHovering = true;
	};

	const handleDragLeave = (e: DragEvent) => {
		e.preventDefault();
		isHovering = false;
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		isHovering = false;

		if (e.dataTransfer && e.dataTransfer.files.length > 0) {
			const droppedFile = e.dataTransfer.files[0];
			if (droppedFile.name.endsWith('.fit')) {
				file = droppedFile;
				summary = null;
				validationMessages = [];
			} else {
				alert('Please drop a valid .fit file.');
			}
		}
	};

	const handleFileSelect = (e: Event) => {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			file = target.files[0];
			summary = null;
			validationMessages = [];
		}
	};

	const analyzeFile = async () => {
		if (!file) return;

		isProcessing = true;
		try {
			summary = await analyzeFitFile(file, sessionId);
			dispatch('rideParsed', { path: summary.path });
		} catch (err: any) {
			validationMessages = [`Error: ${err.message || err}`];
			file = null;
		} finally {
			isProcessing = false;
		}
	};

	const confirmValidation = async () => {
		if (!summary) return;

		isProcessing = true;
		try {
			validationMessages = await commitValidation(summary.newlyCheckedNodes);
			dispatch('validated');
			summary = null;
			file = null;
		} catch (err: any) {
			validationMessages = [`Error: ${err.message || err}`];
		} finally {
			isProcessing = false;
		}
	};

	const cancel = () => {
		summary = null;
		file = null;
		validationMessages = [];
		dispatch('rideCancelled');
	};

	function formatTime(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		if (h > 0) return `${h}h ${m}m ${s}s`;
		return `${m}m ${s}s`;
	}
</script>

<div class="bg-neutral-800 p-4 rounded-lg shadow-lg h-full flex flex-col overflow-hidden">
	<h2 class="text-lg font-bold mb-3 text-orange-500">Validate Check(s)</h2>

	{#if !file && !summary}
		<label
			for="file-upload"
			role="region"
			aria-label="File Upload Dropzone"
			class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors flex-1 flex flex-col items-center justify-center {isHovering
				? 'border-orange-500 bg-neutral-700'
				: 'border-neutral-600 hover:border-orange-400'}"
			on:dragover={handleDragOver}
			on:dragleave={handleDragLeave}
			on:drop={handleDrop}
		>
			<svg
				class="w-8 h-8 text-neutral-400 mb-2"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				aria-hidden="true"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
				></path></svg
			>
			<p class="text-sm text-neutral-400">
				<span class="font-semibold text-white">Click to upload</span> or drag and drop
			</p>
			<p class="text-xs text-neutral-500 mt-1">Only .fit files are supported</p>
			<input
				id="file-upload"
				type="file"
				class="hidden"
				accept=".fit"
				on:change={handleFileSelect}
			/>
		</label>
	{:else if file && !summary}
		<div class="flex-1 flex flex-col items-center justify-center p-6 bg-neutral-700 rounded-lg">
			<span class="text-sm text-white font-medium mb-4">{file.name}</span>
			<div class="flex space-x-3">
				<button
					on:click={analyzeFile}
					disabled={isProcessing}
					class="bg-orange-600 hover:bg-orange-500 text-white font-semibold py-2 px-6 rounded-lg transition disabled:opacity-50"
				>
					{isProcessing ? 'Analyzing…' : 'Analyze Ride'}
				</button>
				<button
					on:click={cancel}
					disabled={isProcessing}
					class="bg-neutral-600 hover:bg-neutral-500 text-white font-semibold py-2 px-6 rounded-lg transition"
				>
					Cancel
				</button>
			</div>
		</div>
	{:else if summary}
		<div class="flex-1 flex flex-col overflow-hidden">
			<div class="grid grid-cols-2 gap-2 mb-4">
				<div class="bg-neutral-900 p-2 rounded border border-neutral-700">
					<p class="text-[10px] uppercase text-neutral-500 font-bold">Distance</p>
					<p class="text-sm text-white font-mono">
						{(summary.stats.distanceMeters / 1000).toFixed(2)} km
					</p>
				</div>
				<div class="bg-neutral-900 p-2 rounded border border-neutral-700">
					<p class="text-[10px] uppercase text-neutral-500 font-bold">Elevation</p>
					<p class="text-sm text-white font-mono">
						{Math.round(summary.stats.elevationGainMeters)} m
					</p>
				</div>
				<div class="bg-neutral-900 p-2 rounded border border-neutral-700">
					<p class="text-[10px] uppercase text-neutral-500 font-bold">Time</p>
					<p class="text-sm text-white font-mono">{formatTime(summary.stats.movingTimeSeconds)}</p>
				</div>
				<div class="bg-neutral-900 p-2 rounded border border-neutral-700">
					<p class="text-[10px] uppercase text-neutral-500 font-bold">Avg Speed</p>
					<p class="text-sm text-white font-mono">{summary.stats.avgSpeedKph.toFixed(1)} km/h</p>
				</div>

				{#if summary.stats.avgPower !== undefined}
					<div class="bg-neutral-900 p-2 rounded border border-neutral-700">
						<p class="text-[10px] uppercase text-neutral-500 font-bold">Avg Power</p>
						<p class="text-sm text-white font-mono">{Math.round(summary.stats.avgPower)} W</p>
					</div>
				{/if}
				{#if summary.stats.avgHR !== undefined}
					<div class="bg-neutral-900 p-2 rounded border border-neutral-700">
						<p class="text-[10px] uppercase text-neutral-500 font-bold">Avg HR</p>
						<p class="text-sm text-white font-mono">{Math.round(summary.stats.avgHR)} bpm</p>
					</div>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto mb-4 min-h-[100px]">
				<p class="text-xs font-bold text-neutral-400 mb-1">
					Locations to clear ({summary.newlyCheckedNodes.length}):
				</p>
				{#if summary.newlyCheckedNodes.length > 0}
					<div class="space-y-1">
						{#each summary.newlyCheckedNodes as node}
							<div
								class="p-2 bg-neutral-900 rounded border border-neutral-700 text-xs text-green-400 flex justify-between"
							>
								<span>Check #{node.ap_location_id}</span>
								<span class="text-neutral-500 font-mono"
									>[{node.lat.toFixed(4)}, {node.lon.toFixed(4)}]</span
								>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-neutral-500 italic p-2 bg-neutral-900 rounded">
						No locations reached in this ride.
					</p>
				{/if}
			</div>

			<div class="flex space-x-2">
				<button
					on:click={confirmValidation}
					disabled={isProcessing || summary.newlyCheckedNodes.length === 0}
					class="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg transition disabled:opacity-50"
				>
					{isProcessing ? 'Processing…' : 'Confirm & Send'}
				</button>
				<button
					on:click={cancel}
					disabled={isProcessing}
					class="bg-neutral-600 hover:bg-neutral-500 text-white font-semibold py-2 px-4 rounded-lg transition"
				>
					Cancel
				</button>
			</div>
		</div>
	{/if}

	{#if validationMessages.length > 0}
		<div class="mt-3 space-y-1 overflow-y-auto max-h-24">
			{#each validationMessages as msg}
				<div class="p-2 bg-neutral-900 rounded border border-neutral-700 text-xs text-neutral-200">
					{msg}
				</div>
			{/each}
		</div>
	{/if}
</div>

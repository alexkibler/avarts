<script lang="ts">
  // Form state
  let slotName = '';
  let radius = 5000;
  let checkCount = 10;

  let isGenerating = false;
  let errorMsg = '';

  /**
   * Generates a basic YAML configuration for an Archipelago slot.
   * This YAML is uploaded to an Archipelago server to generate a multiworld.
   */
  function generateYaml(): string {
    return [
      `game: Bikeapelago`,
      `name: ${slotName || 'BikePlayer'}`,
      ``,
      `Bikeapelago:`,
      `  check_count: ${checkCount}`,
      `  goal_type: all_intersections`,
    ].join('\n');
  }

  function downloadYaml() {
    isGenerating = true;
    errorMsg = '';

    try {
      if (!slotName.trim()) {
        throw new Error('Please enter a slot name.');
      }

      const yaml = generateYaml();
      const blob = new Blob([yaml], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slotName}.yaml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      errorMsg = err.message || 'Failed to generate YAML.';
    } finally {
      isGenerating = false;
    }
  }

  function downloadApworld() {
    window.location.href = '/bikeapelago.apworld';
  }
</script>

<svelte:head>
  <title>Bikeapelago YAML Creator</title>
</svelte:head>

<div class="p-6 text-white max-w-2xl mx-auto">
  <div class="bg-neutral-800 p-6 rounded-lg shadow-lg border border-neutral-700">
    <h1 class="text-3xl font-bold mb-2 text-orange-500">Archipelago Setup</h1>
    <p class="text-neutral-400 mb-6">
      Create configuration files for your Archipelago multiworld. Download both files and upload them to your Archipelago server.
    </p>

    <div class="space-y-6">
      <!-- Step 1: Configuration Form -->
      <div>
        <h2 class="text-xl font-bold mb-4">Step 1: Configure Your Game</h2>

        <form on:submit|preventDefault={downloadYaml} class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1" for="slotName">Slot Name</label>
            <input
              id="slotName"
              type="text"
              bind:value={slotName}
              required
              placeholder="MyBikeGame"
              disabled={isGenerating}
              class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500 disabled:opacity-50"
            />
            <p class="text-xs text-neutral-400 mt-1">This is your player name in Archipelago.</p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1" for="checkCount">Check Count</label>
              <input
                id="checkCount"
                type="number"
                bind:value={checkCount}
                required
                min="1"
                max="2000"
                disabled={isGenerating}
                class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500 disabled:opacity-50"
              />
              <p class="text-xs text-neutral-400 mt-1">How many bike intersections to collect.</p>
            </div>

            <div>
              <label class="block text-sm font-medium mb-1" for="radius">Search Radius (meters)</label>
              <input
                id="radius"
                type="number"
                bind:value={radius}
                required
                min="100"
                max="50000"
                step="100"
                disabled={isGenerating}
                class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500 disabled:opacity-50"
              />
              <p class="text-xs text-neutral-400 mt-1">Search area around your starting point.</p>
            </div>
          </div>

          {#if errorMsg}
            <div class="p-3 bg-red-900/50 border border-red-500 text-red-200 rounded text-sm">
              {errorMsg}
            </div>
          {/if}

          <button
            type="submit"
            disabled={isGenerating}
            class="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-4 rounded transition disabled:opacity-50"
          >
            {isGenerating ? 'Generating…' : 'Download YAML'}
          </button>
        </form>
      </div>

      <!-- Step 2: Download APWorld -->
      <div class="pt-6 border-t border-neutral-600">
        <h2 class="text-xl font-bold mb-4">Step 2: Download APWorld</h2>
        <p class="text-neutral-400 text-sm mb-4">
          The .apworld file contains the Bikeapelago game definition for Archipelago.
        </p>
        <button
          on:click={downloadApworld}
          class="w-full flex items-center justify-center gap-2 bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white font-medium px-4 py-3 rounded transition"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5 text-orange-400 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download bikeapelago.apworld
        </button>
      </div>

      <!-- Step 3: Upload to Archipelago -->
      <div class="pt-6 border-t border-neutral-600">
        <h2 class="text-xl font-bold mb-4">Step 3: Upload to Archipelago</h2>
        <ol class="text-neutral-400 text-sm space-y-2 list-decimal list-inside">
          <li>Visit your Archipelago server (e.g., archipelago.gg or your local server)</li>
          <li>Create a new multiworld room</li>
          <li>Upload your downloaded YAML file</li>
          <li>Upload the .apworld file to the server's apworld directory</li>
          <li>Generate the multiworld</li>
        </ol>
        <p class="text-xs text-neutral-500 mt-4">
          Once your multiworld is running, return to Bikeapelago and connect to it using the "+ New Session" button.
        </p>
      </div>

      <!-- Info -->
      <div class="pt-6 border-t border-neutral-600 bg-neutral-700/50 p-4 rounded">
        <p class="text-xs text-neutral-400">
          <strong>Note:</strong> This tool generates the configuration files only. To play, you need an Archipelago server running with your multiworld.
        </p>
      </div>
    </div>
  </div>
</div>

<style>
  :global(html, body) {
    overflow: auto;
  }
</style>

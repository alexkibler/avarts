<script lang="ts">
  import { validateFitFile } from '$lib/validation';

  export let sessionId: string; // Add sessionId prop

  let isHovering = false;
  let file: File | null = null;
  let validationMessages: string[] = [];
  let isProcessing = false;

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
        validationMessages = [];
      } else {
        alert("Please drop a valid .fit file.");
      }
    }
  };

  const handleFileSelect = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      file = target.files[0];
      validationMessages = [];
    }
  };

  const processFile = async () => {
    if (!file) return;

    isProcessing = true;
    try {
      validationMessages = await validateFitFile(file, sessionId);
    } catch (err: any) {
      validationMessages = [\`Error: \${err}\`];
    } finally {
      isProcessing = false;
      file = null;
    }
  };
</script>

<div class="bg-neutral-800 p-6 rounded-lg shadow-lg">
  <h2 class="text-2xl font-bold mb-4 text-orange-500">Validate Check(s)</h2>

  <div
    role="region"
    aria-label="File Upload Dropzone"
    class="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors \${isHovering ? 'border-orange-500 bg-neutral-700' : 'border-neutral-600 hover:border-orange-400'}"
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    on:drop={handleDrop}
  >
    <div class="flex flex-col items-center">
      <svg class="w-12 h-12 text-neutral-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
      <p class="mb-2 text-sm text-neutral-400"><span class="font-semibold text-white">Click to upload</span> or drag and drop</p>
      <p class="text-xs text-neutral-500">Only .fit files are supported</p>
    </div>
    <input id="file-upload" type="file" class="hidden" accept=".fit" on:change={handleFileSelect} />
  </div>

  {#if file}
    <div class="mt-4 p-4 bg-neutral-700 rounded-lg flex justify-between items-center">
      <span class="text-sm text-white truncate">{file.name}</span>
      <button
        on:click={processFile}
        disabled={isProcessing}
        class="bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold py-2 px-4 rounded transition disabled:opacity-50"
      >
        {isProcessing ? 'Processing...' : 'Validate'}
      </button>
    </div>
  {/if}

  {#if validationMessages.length > 0}
    <div class="mt-4 space-y-2">
      <h3 class="text-sm font-semibold text-neutral-300">Validation Results:</h3>
      {#each validationMessages as msg}
        <div class="p-3 bg-neutral-900 rounded border border-neutral-700 text-sm text-neutral-200">
          {msg}
        </div>
      {/each}
    </div>
  {/if}
</div>

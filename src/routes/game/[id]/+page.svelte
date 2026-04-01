<script lang="ts">
  import { onMount } from 'svelte';
  import { pb } from '$lib/pb';
  import ApMap from '$components/apMap.svelte';
  import ApDropzone from '$components/apDropzone.svelte';
  import type { ApConnectionOptions } from '$lib/ap';

  export let data: { user: any; sessionId: string };

  let session: any = null;
  let loadError = '';

  // AP connection form state (pre-filled from session, editable)
  let apUrl = '';
  let apSlot = '';
  let apPassword = '';

  // Set once the user clicks "Connect & Play" — mounts the map
  let activeConnectionOptions: ApConnectionOptions | null = null;
  let connecting = false;
  let connectionError = '';

  // Node stats for the HUD
  let nodeStats = { hidden: 0, available: 0, checked: 0 };

  onMount(async () => {
    try {
      session = await pb.collection('game_sessions').getOne(data.sessionId);
      apUrl = session.ap_server_url || 'archipelago.gg:38281';
      apSlot = session.ap_slot_name || '';
      await refreshNodeStats();
    } catch (e: any) {
      loadError = e?.message ?? 'Failed to load session.';
    }
  });

  async function refreshNodeStats() {
    if (!session) return;
    const nodes = await pb.collection('map_nodes').getFullList({
      filter: `session = "${session.id}"`,
      fields: 'state',
    });
    nodeStats = {
      hidden:    nodes.filter((n: any) => n.state === 'Hidden').length,
      available: nodes.filter((n: any) => n.state === 'Available').length,
      checked:   nodes.filter((n: any) => n.state === 'Checked').length,
    };
  }

  async function handleConnect() {
    if (!session) return;
    connecting = true;
    connectionError = '';
    try {
      activeConnectionOptions = {
        url: apUrl.trim(),
        game: 'IRL Cycling',
        name: apSlot.trim(),
        password: apPassword.trim() || undefined,
        sessionId: session.id,
      };
    } catch (e: any) {
      connectionError = e?.message ?? 'Connection failed.';
      activeConnectionOptions = null;
    } finally {
      connecting = false;
    }
  }

  function handleDisconnect() {
    activeConnectionOptions = null;
  }

  // Refresh stats after dropzone validates a file
  async function handleValidated() {
    await refreshNodeStats();
  }
</script>

<svelte:head>
  <title>{session?.ap_seed_name ?? 'Loading…'} — IRL Cycling</title>
</svelte:head>

{#if loadError}
  <div class="flex items-center justify-center h-64">
    <p class="text-red-400 text-lg">{loadError}</p>
  </div>
{:else if !session}
  <div class="flex items-center justify-center h-64">
    <p class="text-neutral-400 text-lg">Loading session…</p>
  </div>
{:else}
  <!-- ── Session header bar ─────────────────────────────────────────── -->
  <div class="bg-neutral-800 border-b border-neutral-600 px-4 py-2 flex flex-wrap items-center gap-4 text-sm">
    <div>
      <span class="text-neutral-400">Seed: </span>
      <span class="text-white font-semibold">{session.ap_seed_name}</span>
    </div>
    <div>
      <span class="text-neutral-400">Server: </span>
      <span class="text-white">{session.ap_server_url}</span>
    </div>
    <div>
      <span class="text-neutral-400">Slot: </span>
      <span class="text-white">{session.ap_slot_name}</span>
    </div>
    <div class="ml-auto flex gap-4">
      <span class="text-neutral-400">Hidden: <strong class="text-white">{nodeStats.hidden}</strong></span>
      <span class="text-orange-400">Available: <strong>{nodeStats.available}</strong></span>
      <span class="text-green-400">Checked: <strong>{nodeStats.checked}</strong></span>
    </div>
    {#if activeConnectionOptions}
      <button on:click={handleDisconnect} class="ml-2 text-xs text-red-400 hover:text-red-300 border border-red-800 rounded px-2 py-0.5">
        Disconnect
      </button>
      <span class="text-green-400 text-xs font-semibold">● Connected</span>
    {/if}
  </div>

  {#if !activeConnectionOptions}
    <!-- ── Connect form ──────────────────────────────────────────────── -->
    <div class="flex items-center justify-center min-h-[calc(100vh-160px)]">
      <div class="bg-neutral-800 p-8 rounded-lg shadow-xl w-full max-w-md border border-neutral-600">
        <h2 class="text-2xl font-bold text-orange-500 mb-6">Connect to Archipelago</h2>
        <form on:submit|preventDefault={handleConnect} class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-neutral-300 mb-1" for="ap-url">Server URL</label>
            <input id="ap-url" bind:value={apUrl} required
              class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-neutral-300 mb-1" for="ap-slot">Slot Name</label>
            <input id="ap-slot" bind:value={apSlot} required
              class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-neutral-300 mb-1" for="ap-pass">Password <span class="text-neutral-500">(optional)</span></label>
            <input id="ap-pass" type="password" bind:value={apPassword}
              class="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2 text-white focus:outline-none focus:border-orange-500" />
          </div>
          {#if connectionError}
            <p class="text-red-400 text-sm">{connectionError}</p>
          {/if}
          <button type="submit" disabled={connecting}
            class="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 rounded transition disabled:opacity-50">
            {connecting ? 'Connecting…' : 'Connect & Play'}
          </button>
        </form>
      </div>
    </div>
  {:else}
    <!-- ── Game layout: map + dropzone ──────────────────────────────── -->
    <div class="flex flex-col" style="height: calc(100vh - 96px);">
      <!-- Map (takes ~65% of remaining height) -->
      <div class="flex-1 min-h-0">
        <ApMap
          view={[session.center_lat, session.center_lon]}
          zoom={14}
          from="game"
          user={data.user}
          sessionId={session.id}
          apConnectionOptions={activeConnectionOptions}
        />
      </div>

      <!-- Dropzone panel (fixed height) -->
      <div class="h-56 overflow-y-auto bg-neutral-900 border-t border-neutral-600 p-4">
        <ApDropzone sessionId={session.id} on:validated={handleValidated} />
      </div>
    </div>
  {/if}
{/if}

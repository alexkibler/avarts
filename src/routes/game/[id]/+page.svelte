<script lang="ts">
  import { onMount } from 'svelte';
  import { pb } from '$lib/pb';
  import ApMap from '$components/apMap.svelte';
  import { connectToAp, apClient } from '$lib/ap';
  import type { ApConnectionOptions } from '$lib/ap';

  export let data: { user: any; sessionId: string };

  let session: any = null;
  let loadError = '';

  // AP connection form state (pre-filled from session, editable)
  let apUrl = '';
  let apSlot = '';
  let apPassword = '';

  // Set once successfully connected — mounts the map
  let activeConnectionOptions: ApConnectionOptions | null = null;
  let isConnected = false;
  let connecting = false;
  let connectionError = '';

  let apMapRef: any;

  // Node stats for the HUD
  let nodeStats = { hidden: 0, available: 0, checked: 0 };

  onMount(async () => {
    try {
      session = await pb.collection('game_sessions').getOne(data.sessionId);
      apUrl = session.ap_server_url || localStorage.getItem('last_ap_url') || 'archipelago.gg:38281';
      apSlot = session.ap_slot_name || '';

      // Auto-connect if we have the server and slot
      if (apUrl && apSlot) {
        handleConnect();
      }
    } catch (e: any) {
      loadError = e?.message ?? 'Failed to load session.';
    }
  });

  async function handleConnect() {
    if (!session) return;
    connecting = true;
    connectionError = '';
    const options: ApConnectionOptions = {
      url: apUrl.trim(),
      game: 'Bikeapelago',
      name: apSlot.trim(),
      password: apPassword.trim() || undefined,
      sessionId: session.id,
    };
    const ok = await connectToAp(options);
    if (ok) {
      activeConnectionOptions = options;
      isConnected = true;
      localStorage.setItem('last_ap_url', options.url);
      await pb.collection('game_sessions').update(session.id, { ap_server_url: options.url });
    } else {
      connectionError = 'Could not connect. Check server URL, slot name, and password.';
    }
    connecting = false;
  }

  function handleDisconnect() {
    apClient.socket.disconnect();
    activeConnectionOptions = null;
    isConnected = false;
  }

  async function handleValidated() {
    // ApMap will handle node stats update via subscription
  }

  function downloadYaml() {
    const totalChecks = nodeStats.hidden + nodeStats.available + nodeStats.checked;
    const yaml = [
      `game: Bikeapelago`,
      `name: ${session.ap_slot_name}`,
      ``,
      `Bikeapelago:`,
      `  check_count: ${totalChecks}`,
      `  goal_type: all_intersections`,
    ].join('\n');
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.ap_slot_name}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<svelte:head>
  <title>{session?.ap_seed_name ?? 'Loading…'} — Bikeapelago</title>
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
    {#if activeConnectionOptions}
      <div>
        <span class="text-neutral-400">Server: </span>
        <span class="text-white">{activeConnectionOptions.url}</span>
      </div>
    {/if}
    <div>
      <span class="text-neutral-400">Slot: </span>
      <span class="text-white">{session.ap_slot_name}</span>
    </div>
    <div class="ml-auto flex gap-4">
      <span class="text-neutral-400">Hidden: <strong class="text-white">{nodeStats.hidden}</strong></span>
      <span class="text-orange-400">Available: <strong>{nodeStats.available}</strong></span>
      <span class="text-green-400">Checked: <strong>{nodeStats.checked}</strong></span>
    </div>
    {#if isConnected}
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

        <div class="mt-6 pt-5 border-t border-neutral-600">
          <p class="text-xs text-neutral-400 mb-3">Need to set up the Archipelago server first? Download these files:</p>
          <div class="flex gap-3">
            <button
              type="button"
              on:click={downloadYaml}
              class="flex-1 flex items-center justify-center gap-2 bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white text-sm font-medium px-4 py-2 rounded transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-orange-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Player YAML
            </button>
            <a
              href="/bikeapelago.apworld"
              download="bikeapelago.apworld"
              class="flex-1 flex items-center justify-center gap-2 bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white text-sm font-medium px-4 py-2 rounded transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-orange-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              .apworld
            </a>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <!-- ── Game layout: full-page ApMap (which now includes sidebar and bottom bar) ── -->
    <div class="flex flex-col h-[calc(100vh-96px)]">
      <ApMap
        bind:this={apMapRef}
        bind:nodeStats
        sessionId={session.id}
        centerLat={session.center_lat}
        centerLon={session.center_lon}
        radius={session.radius}
        on:validated={handleValidated}
      />
    </div>
  {/if}
{/if}

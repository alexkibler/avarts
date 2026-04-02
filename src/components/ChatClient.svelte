<script lang="ts">
  import { afterUpdate } from 'svelte';
  import { chatMessages, apClient } from '$lib/ap';
  import type { ChatMessage } from '$lib/ap';

  let input = '';
  let msgContainer: HTMLElement;

  // Auto-scroll to bottom whenever messages update
  afterUpdate(() => {
    if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
  });

  function send() {
    const text = input.trim();
    if (!text || !apClient.authenticated) return;
    input = '';
    // Use socket.send directly so /commands don't hang waiting for a Chat echo
    // that the server never sends (commands return CommandResult, not Chat).
    apClient.socket.send({ cmd: 'Say', text });
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function msgClass(type: ChatMessage['type']): string {
    switch (type) {
      case 'chat':   return 'text-white';
      case 'item':   return 'text-cyan-300';
      case 'system': return 'text-yellow-300';
      default:       return 'text-neutral-400';
    }
  }
</script>

<div class="flex flex-col h-full min-h-0">
  <!-- Message log -->
  <div
    bind:this={msgContainer}
    class="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 font-mono text-xs min-h-0"
  >
    {#if $chatMessages.length === 0}
      <p class="text-neutral-500 italic">Waiting for messages…</p>
    {:else}
      {#each $chatMessages as msg (msg.id)}
        <div class="leading-snug break-words {msgClass(msg.type)}">{msg.text}</div>
      {/each}
    {/if}
  </div>

  <!-- Input bar -->
  <div class="shrink-0 border-t border-neutral-600 p-2 flex gap-2">
    <input
      bind:value={input}
      on:keydown={onKeydown}
      placeholder="Chat or /command…"
      class="flex-1 bg-neutral-700 border border-neutral-600 rounded px-2 py-1.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
    />
    <button
      on:click={send}
      disabled={!input.trim()}
      class="bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold px-3 py-1.5 rounded transition disabled:opacity-40"
    >
      Send
    </button>
  </div>
</div>

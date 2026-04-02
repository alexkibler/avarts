<script lang="ts">
  import { chatStore } from '$lib/stores';
  import { apClient } from '$lib/ap';
  import { afterUpdate, onMount } from 'svelte';

  let inputMessage = '';
  let messagesContainer: HTMLElement;

  // Auto-scroll to bottom when new messages arrive
  afterUpdate(() => {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  async function sendMessage() {
    if (!inputMessage.trim()) return;
    try {
      await apClient.messages.say(inputMessage);
      inputMessage = '';
    } catch (error) {
      console.error('Failed to send message', error);
      // Optional: Add error to chat
      chatStore.update(msgs => [...msgs, `[Error] Failed to send message: ${error}`]);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendMessage();
    }
  }
</script>

<div class="flex flex-col h-full bg-neutral-900 border border-neutral-600 rounded-lg overflow-hidden">
  <!-- Messages Area -->
  <div class="flex-1 overflow-y-auto p-3 space-y-2" bind:this={messagesContainer}>
    {#if $chatStore.length === 0}
      <div class="text-neutral-500 text-sm text-center mt-4">No messages yet.</div>
    {/if}
    {#each $chatStore as msg}
      <div class="text-sm text-neutral-200">
        {msg}
      </div>
    {/each}
  </div>

  <!-- Input Area -->
  <div class="border-t border-neutral-700 p-2 bg-neutral-800 flex">
    <input
      type="text"
      bind:value={inputMessage}
      on:keydown={handleKeydown}
      placeholder="Type a message or /command..."
      class="flex-1 bg-neutral-700 border border-neutral-600 rounded-l-md px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500"
    />
    <button
      on:click={sendMessage}
      class="bg-orange-600 hover:bg-orange-500 text-white font-semibold px-4 py-1.5 rounded-r-md transition text-sm"
    >
      Send
    </button>
  </div>
</div>

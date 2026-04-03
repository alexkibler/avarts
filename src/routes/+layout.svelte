<script lang="ts">
  import "../app.css";
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import Header from "./header.svelte";
  import BottomNav from "$components/BottomNav.svelte";
  import { userCookie } from "$lib/stores"
  import { pb } from "$lib/pb"
  import type { UserData } from "$lib/types";

  export let data: UserData;

  $: isGamePage = $page.url.pathname.startsWith('/game/');

  $: {
    // Re-run whenever `data` changes to ensure auth state stays synced
    $userCookie = data;
    if (browser) {
      pb.authStore.loadFromCookie(document.cookie);
    }
  }

  function logError(level: 'error' | 'unhandledrejection', message: string, extra?: { source?: string; stack?: string }) {
    pb.collection('client_errors').create({
      level,
      message,
      source: extra?.source ?? '',
      stack: extra?.stack ?? '',
      page_url: window.location.href,
      user: $userCookie?.user?.id ?? null,
      user_agent: navigator.userAgent
    }).catch(() => {/* swallow — don't recurse */});
  }

  onMount(() => {
    window.addEventListener('error', (e) => {
      console.error('[bikeapelago:error]', e.message, e.filename, e.lineno, e.colno, e.error);
      logError('error', e.message, { source: `${e.filename}:${e.lineno}:${e.colno}`, stack: e.error?.stack });
    });
    window.addEventListener('unhandledrejection', (e) => {
      const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
      console.error('[bikeapelago:unhandledrejection]', e.reason);
      logError('unhandledrejection', msg, { stack: e.reason instanceof Error ? e.reason.stack : undefined });
    });
  });
</script>

<div class="min-h-screen bg-neutral-700 flex flex-col {isGamePage ? 'h-screen' : ''}" data-sveltekit-prefetch>
  <div class="bg-neutral-800 border-b-neutral-600 border-b-2 sticky top-0 shrink-0">
    <Header data={data} {isGamePage} />
  </div>
  <main class="{isGamePage ? 'flex-1 flex flex-col w-full min-h-0' : 'flex-1 max-w-screen md:max-w-7xl mx-auto w-full'} pb-20 md:pb-0">
    <slot />
  </main>
  <BottomNav />
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&family=Sen&display=swap');
  :global(html) {
    font-family: 'Poppins', sans-serif;
    background-color:  rgb(38 38 38);
  }
  :global(::-webkit-scrollbar) {
    width: 10px;
  }
  :global(::-webkit-scrollbar-track) {
    background: #f1f1f1;
  }
  :global(::-webkit-scrollbar-thumb) {
    background: #888;
  }
  :global(::-webkit-scrollbar-thumb:hover) {
    background: #555;
  }
</style>

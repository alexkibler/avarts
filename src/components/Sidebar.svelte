<script lang="ts">
  import { page } from '$app/stores';
  import { activeGameTab, userCookie } from '$lib/stores';
  import { env } from '$env/dynamic/public';

  $: pathname = $page.url.pathname;
  $: isGamePage = pathname.startsWith('/game/');
  $: user = $userCookie?.user;
  $: url = env.PUBLIC_POCKETBASE_URL || '';

  function handleTab(tab: 'chat' | 'upload' | 'route' | null) {
    activeGameTab.update(current => current === tab ? null : tab);
  }
</script>

<aside class="hidden md:flex flex-col w-64 h-screen bg-neutral-900 border-r border-white/5 sticky top-0 shrink-0 z-[1001]">
  <!-- Logo Section -->
  <div class="p-6">
    <a href="/" class="flex items-center">
      <img class="h-6 w-auto" src="/bikeapelago.svg" alt="Bikeapelago"/>
    </a>
  </div>

  <!-- Navigation Links -->
  <nav class="flex-1 px-4 space-y-2 mt-4">
    {#if isGamePage}
      <!-- Game Mode Navigation -->
      <a
        href="/"
        class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-neutral-400 hover:text-white hover:bg-white/5"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span class="font-medium text-sm">Return Home</span>
      </a>

      <div class="h-px bg-white/5 my-4"></div>

      <button
        on:click={() => handleTab('chat')}
        class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 {$activeGameTab === 'chat' ? 'bg-orange-500/10 text-orange-500 shadow-inner shadow-orange-500/5' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="font-medium text-sm">Game Chat</span>
      </button>

      <button
        on:click={() => handleTab('upload')}
        class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 {$activeGameTab === 'upload' ? 'bg-orange-500/10 text-orange-500 shadow-inner shadow-orange-500/5' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
        <span class="font-medium text-sm">Upload GPX</span>
      </button>

      <button
        on:click={() => handleTab('route')}
        class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 {$activeGameTab === 'route' ? 'bg-orange-500/10 text-orange-500 shadow-inner shadow-orange-500/5' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        <span class="font-medium text-sm">Route Planning</span>
      </button>
    {:else}
      <!-- Standard Mode Navigation -->
      <a
        href="/"
        class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 {pathname === '/' ? 'bg-orange-500/10 text-orange-500 shadow-inner shadow-orange-500/5' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span class="font-medium text-sm">Dashboard</span>
      </a>

      <a
        href="/routes"
        class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 {pathname === '/routes' ? 'bg-orange-500/10 text-orange-500 shadow-inner shadow-orange-500/5' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        <span class="font-medium text-sm">Routes</span>
      </a>

      <a
        href="/game"
        class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 {pathname.startsWith('/game') ? 'bg-orange-500/10 text-orange-500 shadow-inner shadow-orange-500/5' : 'text-neutral-400 hover:text-white hover:bg-white/5'}"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"/><path d="M4 19a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4Z"/><path d="M6 15v-2"/><path d="M10 15v-2"/><path d="M14 15v-2"/><path d="M18 15v-2"/></svg>
        <span class="font-medium text-sm">Play Now</span>
      </a>
    {/if}
  </nav>

  <!-- Athlete Profile (at bottom) -->
  {#if user}
    <div class="p-4 mt-auto border-t border-white/5">
      <a href="/athlete" class="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group">
        {#if user.avatar}
          <img src="{url}/api/files/{user.collectionId}/{user.id}/{user.avatar}" alt="avatar" class="h-10 w-10 rounded-xl border border-white/10 object-cover shadow-sm group-hover:scale-105 transition-transform">
        {:else}
          <img src="/avatar.svg" alt="avatar" class="h-10 w-10 rounded-xl border border-white/10 object-cover shadow-sm group-hover:scale-105 transition-transform">
        {/if}
        <div class="flex flex-col min-w-0">
          <span class="text-white font-bold text-sm truncate">{user.name || user.username}</span>
          <span class="text-neutral-500 text-[10px] uppercase font-bold tracking-wider">Athlete Profile</span>
        </div>
      </a>
    </div>
  {/if}
</aside>

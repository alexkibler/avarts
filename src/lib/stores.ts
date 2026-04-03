import { writable } from 'svelte/store';

export const userCookie = writable();
export const activeGameTab = writable<'chat' | 'upload' | 'route' | null>(null);

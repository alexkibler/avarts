import { writable } from 'svelte/store';

export const userCookie = writable();
export const checksStore = writable<any[]>([]);
export const chatStore = writable<any[]>([]);

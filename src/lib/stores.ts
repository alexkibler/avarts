import { writable } from 'svelte/store';
import type { UserData } from './types';

export const userCookie = writable<UserData | null>(null);
export const activeGameTab = writable<'chat' | 'upload' | 'route' | null>(null);

import type { Writable } from 'svelte/store';
import type { ChatMessage } from '$lib/types';

export interface ApConnectionOptions {
	url: string;
	game: string;
	name: string;
	password?: string;
	sessionId: string;
}

export interface IGameEngine {
	// State
	chatMessages: Writable<ChatMessage[]>;
	isGoalReached: Writable<boolean>;
	locationSwaps: Writable<number>;

	// Methods
	connect(options: ApConnectionOptions): Promise<boolean>;
	disconnect(): void;
	syncState(sessionId: string): Promise<void>;
	sendLocationChecks(locationIds: number[]): void;
	say(text: string): void;
}

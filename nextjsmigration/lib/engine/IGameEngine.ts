import type { ChatMessage } from '@/lib/types';

export interface ApConnectionOptions {
	url: string;
	game: string;
	name: string;
	password?: string;
	sessionId: string;
}

export interface IGameEngine {
	// State via callbacks or properties
	chatMessages: ChatMessage[];
	isGoalReached: boolean;
	locationSwaps: number;

  // React state subscriptions
  subscribe: (callback: () => void) => () => void;

	// Methods
	connect(options: ApConnectionOptions): Promise<boolean>;
	disconnect(): void;
	syncState(sessionId: string): Promise<void>;
	sendLocationChecks(locationIds: number[]): void;
	say(text: string): void;
}

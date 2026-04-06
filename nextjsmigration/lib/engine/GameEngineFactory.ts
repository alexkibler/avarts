import type { IGameEngine } from './IGameEngine';
import { ArchipelagoEngine } from './ArchipelagoEngine';
import { SinglePlayerEngine } from './SinglePlayerEngine';
import type { GameSession } from '@/lib/types';

export function createGameEngine(session: GameSession): IGameEngine {
	if (session.ap_server_url) {
		return new ArchipelagoEngine();
	} else {
		return new SinglePlayerEngine();
	}
}

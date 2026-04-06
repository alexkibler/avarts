import type PocketBase from 'pocketbase';
import { GeneratorService } from './GeneratorService';
import { ArchipelagoGenerator } from './ArchipelagoGenerator';
import { SinglePlayerGenerator } from './SinglePlayerGenerator';

export function getGeneratorService(
	mode: 'singleplayer' | 'archipelago',
	pb: PocketBase
): GeneratorService {
	if (mode === 'singleplayer') {
		return new SinglePlayerGenerator(pb);
	} else if (mode === 'archipelago') {
		return new ArchipelagoGenerator(pb);
	}
	throw new Error(`Unsupported generation mode: ${mode}`);
}

import { pb } from '@/lib/database';
import type { IGameEngine, ApConnectionOptions } from './IGameEngine';
import type { ChatMessage } from '@/lib/types';

export class SinglePlayerEngine implements IGameEngine {
	public chatMessages: ChatMessage[] = [];
	public isGoalReached: boolean = false;
	public locationSwaps: number = 0;

  private _subscribers: Set<() => void> = new Set();
	private _sessionId = '';
	private _msgId = 0;

  public subscribe(callback: () => void): () => void {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  private notify() {
    this._subscribers.forEach(cb => cb());
  }

	public async connect(options: ApConnectionOptions): Promise<boolean> {
		this._sessionId = options.sessionId;
		this.isGoalReached = false;
    this.notify();

		this.pushMessage('Connected to Single Player mode.', 'system');

		// Ensure initial nodes state is loaded
		await this.syncState(this._sessionId);

		return true;
	}

	public disconnect(): void {
		this.pushMessage('Disconnected.', 'system');
	}

	public async syncState(sessionId: string): Promise<void> {
		if (!sessionId || sessionId !== this._sessionId) return;

		try {
			const nodes = await pb.collection('map_nodes').getFullList({
				filter: `session = "${sessionId}"`,
				requestKey: null
			});

			const remaining = nodes.filter((node: any) => node.state !== 'Checked');

			if (nodes.length > 0 && remaining.length === 0) {
				const session = await pb.collection('game_sessions').getOne(sessionId);
				if (session.status !== 'Completed') {
					await pb.collection('game_sessions').update(sessionId, { status: 'Completed' });
				}
				this.isGoalReached = true;
        this.notify();
			}
		} catch (e) {
			console.error('[SinglePlayer] Error syncing state:', e);
		}
	}

	public sendLocationChecks(locationIds: number[]): void {
		console.log(`[SinglePlayer] Checking ${locationIds.length} locations.`);
		setTimeout(async () => {
			try {
				const nodesInSession = await pb.collection('map_nodes').getFullList({
					filter: `session = "${this._sessionId}"`,
					requestKey: null
				});

				const nodesToMarkChecked = nodesInSession.filter(
					(node: any) => locationIds.includes(node.ap_location_id) && node.state !== 'Checked'
				);

				if (nodesToMarkChecked.length > 0) {
					await Promise.all(
						nodesToMarkChecked.map((node) =>
							pb.collection('map_nodes').update(node.id, { state: 'Checked' }, { requestKey: null })
						)
					);

					for (const node of nodesToMarkChecked) {
						this.pushMessage(
							`Checked location: ${node.name || `Node ${node.ap_location_id}`}`,
							'system'
						);
					}
				}

				const hiddenNodes = await pb.collection('map_nodes').getFullList({
					filter: `session = "${this._sessionId}" && state = "Hidden"`,
					sort: '+ap_location_id',
					requestKey: null
				});

				const nodesToUnlock = hiddenNodes.slice(0, locationIds.length);

				if (nodesToUnlock.length > 0) {
					await Promise.all(
						nodesToUnlock.map((node) =>
							pb
								.collection('map_nodes')
								.update(node.id, { state: 'Available' }, { requestKey: null })
						)
					);

					for (let i = 0; i < nodesToUnlock.length; i++) {
						this.pushMessage(`Found an item! A new location was revealed.`, 'item');
					}
				}

				await this.syncState(this._sessionId);
			} catch (e) {
				console.error('[SinglePlayer] Unlock failed', e);
			}
		}, 200);
	}

	public say(text: string): void {
		this.pushMessage(text, 'chat');
	}

	private pushMessage(text: string, type: ChatMessage['type']) {
    this.chatMessages = [...this.chatMessages, { id: ++this._msgId, text, type }];
    this.notify();
	}
}

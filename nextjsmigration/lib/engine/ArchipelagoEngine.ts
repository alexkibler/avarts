import { Client } from '@airbreather/archipelago.js';
import { pb } from '@/lib/database';
import type { IGameEngine, ApConnectionOptions } from './IGameEngine';
import type { ChatMessage, ChatMessageType } from '@/lib/types';

export class ArchipelagoEngine implements IGameEngine {
	public chatMessages: ChatMessage[] = [];
	public isGoalReached: boolean = false;
	public locationSwaps: number = 0;

  private _subscribers: Set<() => void> = new Set();

	public apClient: Client;

	private _activeSessionId = '';
	private _msgId = 0;
	private _pendingType: ChatMessageType = 'server';
	private _listenersRegistered = false;

	private _connectedUrl = '';
	private _connectedSlotName = '';

	private _testMode = false;
	private _testSessionId = '';

	private _isSyncing = false;
	private _hasPendingSync = false;

	constructor() {
		this.apClient = new Client();
	}

  public subscribe(callback: () => void): () => void {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  private notify() {
    this._subscribers.forEach(cb => cb());
  }

	public async connect(options: ApConnectionOptions): Promise<boolean> {
		this.setupListeners();
		this._activeSessionId = options.sessionId;
		this._connectedUrl = options.url;
		this._connectedSlotName = options.name;

		const connectionOptions: any = {
			slotData: true,
			version: {
				major: 0,
				minor: 6,
				build: 2
			}
		};

		if (options.password) {
			connectionOptions.password = options.password;
		}

		const cleanUrl = options.url.trim();
		const isLocalhost =
			cleanUrl.toLowerCase().includes('localhost') || cleanUrl.includes('127.0.0.1');

		let finalUrl = cleanUrl;
		if (isLocalhost) {
			if (!cleanUrl.startsWith('ws://') && !cleanUrl.startsWith('wss://')) {
				finalUrl = 'ws://' + cleanUrl;
			}
		} else {
			finalUrl = cleanUrl.replace(/^wss?:\/\//i, '');
		}

		const isTestForce =
			(typeof globalThis !== 'undefined' && (globalThis as any).PLAYWRIGHT_TEST) ||
			(typeof window !== 'undefined' && (window as any).PLAYWRIGHT_TEST);
		const isMockMode = process.env.NEXT_PUBLIC_MOCK_MODE === 'true';

		if (finalUrl === 'test' || finalUrl === 'ws://test' || isTestForce || isMockMode) {
			console.log('[AP] Test/Mock mode bypass engaged.');
			this._testMode = true;
			this._testSessionId = options.sessionId;
			return true;
		}

		try {
			console.log(`[AP] Connecting to: ${finalUrl} as ${options.name}`);

			await this.apClient.login(finalUrl, options.name, options.game, connectionOptions);

			console.log('[AP] Connected successfully!');
			console.log(
				`[AP] Items received: ${this.apClient.items.received.length}, Checked locations: ${this.apClient.room.checkedLocations.length}`
			);

			await this.syncState(options.sessionId);

			return true;
		} catch (error: any) {
			console.error('[AP] Failed to connect:', error?.message ?? error);
			if (error?.stack) console.error(error.stack);
			return false;
		}
	}

	public disconnect(): void {
		if (this.apClient.socket && (this.apClient.socket as any).readyState === WebSocket.OPEN) {
			(this.apClient as any).disconnect();
		}
	}

	public async syncState(sessionId: string): Promise<void> {
		if (!sessionId || sessionId !== this._activeSessionId) return;

		if (this._isSyncing) {
			this._hasPendingSync = true;
			return;
		}

		this._isSyncing = true;
		try {
			do {
				this._hasPendingSync = false;
				await this._doSyncArchipelagoState(this._activeSessionId);
			} while (this._hasPendingSync);
		} finally {
			this._isSyncing = false;
		}
	}

	private async _doSyncArchipelagoState(sessionId: string) {
		try {
			const [nodes, session] = await Promise.all([
				pb.collection('map_nodes').getFullList({
					filter: `session = "${sessionId}"`,
					sort: '+ap_location_id',
					requestKey: null
				}),
				pb.collection('game_sessions').getOne(sessionId, {
					requestKey: null
				})
			]);

			const checkedLocationIds = this.apClient.room.checkedLocations;
			const receivedItems = this.apClient.items.received;

			const receivedItemIds = new Set(receivedItems.map((i: any) => i.id));

			const updates: Promise<any>[] = [];
			let updateCount = 0;

			for (let i = 0; i < nodes.length; i++) {
				const node = nodes[i];
				let newState: 'Hidden' | 'Available' | 'Checked' = 'Hidden';

				const isChecked = checkedLocationIds.includes(node.ap_location_id);
				const isUnlockedByItem = receivedItemIds.has(node.ap_location_id);

				if (isChecked) {
					newState = 'Checked';
				} else if (isUnlockedByItem) {
					newState = 'Available';
				} else {
					newState = 'Hidden';
				}

				if (node.state !== newState) {
					console.log(
						`[AP Sync] Correcting node ${node.ap_location_id} from ${node.state} to ${newState}`
					);
					updates.push(
						pb.collection('map_nodes').update(node.id, { state: newState }, { requestKey: null })
					);
					updateCount++;
				}
			}

			if (updates.length > 0) {
				await Promise.all(updates);
			}

			if (nodes.length !== receivedItemIds.size) {
				console.warn(
					`[AP Sync] Node count mismatch: bikeapelago has ${nodes.length} nodes, ` +
						`but AP provides ${receivedItemIds.size} unlockable items. ` +
						`This may indicate the session was created with a different check count than the AP multiworld expects.`
				);
			}

			const totalSwapsFound = receivedItems.filter((i: any) => i.id === 802003).length;
			const usedSwaps = session.location_swaps_used || 0;
			this.locationSwaps = Math.max(0, totalSwapsFound - usedSwaps);
      this.notify();

			console.log(
				`[AP Sync] Session ${sessionId} reconciled: ${checkedLocationIds.length} checked, ` +
					`${receivedItemIds.size} total unlocked items, ${updateCount} state updates applied.`
			);
		} catch (e) {
			console.error('[AP Sync] Error during state reconciliation:', e);
		}
	}

	public sendLocationChecks(locationIds: number[]): void {
		if (this._testMode) {
			console.log(`[AP] Test mode: MOCKING ${locationIds.length} location checks.`);
			setTimeout(async () => {
				try {
					const nodesInSession = await pb.collection('map_nodes').getFullList({
						filter: `session = "${this._testSessionId}"`,
						requestKey: null
					});

					const nodesToMarkChecked = nodesInSession.filter(
						(node: any) => locationIds.includes(node.ap_location_id) && node.state !== 'Checked'
					);

					if (nodesToMarkChecked.length > 0) {
						await Promise.all(
							nodesToMarkChecked.map((node) =>
								pb
									.collection('map_nodes')
									.update(node.id, { state: 'Checked' }, { requestKey: null })
							)
						);
						nodesToMarkChecked.forEach((node) =>
							console.log(
								`[AP Mock] Marked node ${node.id} (loc ${node.ap_location_id}) as Checked`
							)
						);
					}

					const hiddenNodes = await pb.collection('map_nodes').getFullList({
						filter: `session = "${this._testSessionId}" && state = "Hidden"`,
						sort: '+ap_location_id',
						requestKey: null
					});

					const nodesToUnlockMock = hiddenNodes.slice(0, locationIds.length);

					if (nodesToUnlockMock.length > 0) {
						await Promise.all(
							nodesToUnlockMock.map((node) =>
								pb
									.collection('map_nodes')
									.update(node.id, { state: 'Available' }, { requestKey: null })
							)
						);
						nodesToUnlockMock.forEach((node) =>
							console.log(`[AP Mock] Unlocked node ${node.id} to Available`)
						);
					}

					const remaining = await pb.collection('map_nodes').getFullList({
						filter: `session = "${this._testSessionId}" && state != "Checked"`,
						requestKey: null
					});

					if (remaining.length === 0) {
						console.log('[AP Mock] All nodes cleared! Triggering goal reached.');
						await pb
							.collection('game_sessions')
							.update(this._testSessionId, { status: 'Completed' });
						this.isGoalReached = true;
            this.notify();
					}
				} catch (e) {
					console.error('Mock unlock failed', e);
				}
			}, 500);
			return;
		}

		if (this.apClient.authenticated) {
			this.apClient.check(...locationIds);
		} else {
			console.error('Cannot send checks — client is not authenticated.');
		}
	}

	public say(text: string): void {
		if (!this.apClient.authenticated) return;
		this.apClient.socket.send({ cmd: 'Say', text });
	}

	private setupListeners() {
		if (this._listenersRegistered) return;
		this._listenersRegistered = true;

		this.apClient.messages.on('itemSent', () => {
			this._pendingType = 'item';
		});
		this.apClient.messages.on('itemCheated', () => {
			this._pendingType = 'item';
		});
		this.apClient.messages.on('itemHinted', () => {
			this._pendingType = 'item';
		});
		this.apClient.messages.on('chat', () => {
			this._pendingType = 'chat';
		});
		this.apClient.messages.on('connected', () => {
			this._pendingType = 'system';
			this.isGoalReached = false;
      this.notify();
		});
		this.apClient.messages.on('disconnected', () => {
			this._pendingType = 'system';
		});
		this.apClient.messages.on('goaled', (text, player) => {
			this._pendingType = 'system';
			if (player.slot === (this.apClient as any).data.slot) {
				console.log('[AP] Local player reached the goal!');
				this.isGoalReached = true;
        this.notify();
			}
		});
		this.apClient.messages.on('released', () => {
			this._pendingType = 'system';
		});
		this.apClient.messages.on('collected', () => {
			this._pendingType = 'system';
		});

		this.apClient.messages.on('message', (text: string) => {
      this.chatMessages = [
        ...this.chatMessages,
				{ id: ++this._msgId, text, type: this._pendingType }
      ];
			this._pendingType = 'server';
      this.notify();
		});

		this.apClient.items.on('itemsReceived', async () => {
			await this.syncState(this._activeSessionId);
		});

		this.apClient.room.on('locationsChecked', async () => {
			await this.syncState(this._activeSessionId);
		});
	}
}

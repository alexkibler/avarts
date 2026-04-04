import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectToAp, apClient, sendLocationChecks } from './ap';
import { pb } from '$lib/pb';

vi.mock('$lib/pb', () => ({
  pb: {
    collection: vi.fn(() => ({
      getFullList: vi.fn(),
      update: vi.fn(),
    })),
  },
}));

vi.mock('@airbreather/archipelago.js', () => {
  return {
    Client: class {
      login = vi.fn();
      check = vi.fn();
      authenticated = false;
      items = {
        received: [],
        on: vi.fn(),
      };
      messages = {
        on: vi.fn(),
      };
    }
  };
});

// Since processReceivedItems is not exported, we test it through connectToAp's initial call.
describe('ap.ts module', () => {
  let getFullListMock: any;
  let updateMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    getFullListMock = vi.fn().mockResolvedValue([]);
    updateMock = vi.fn().mockResolvedValue({});
    (pb.collection as any).mockReturnValue({
      getFullList: getFullListMock,
      update: updateMock,
    });

    // Reset client mocked values
    (apClient.login as any).mockResolvedValue(true);
    apClient.authenticated = false;
    apClient.items.received = [];

    // reset global PLAYWRIGHT_TEST
    (globalThis as any).PLAYWRIGHT_TEST = false;
  });

  describe('connectToAp', () => {
    it('bypasses connection when cleanUrl is test', async () => {
      const result = await connectToAp({
        url: 'test',
        game: 'test-game',
        name: 'player1',
        sessionId: 'session-id'
      });

      expect(result).toBe(true);
      expect(apClient.login).not.toHaveBeenCalled();
    });

    it('bypasses connection when PLAYWRIGHT_TEST is set', async () => {
      (globalThis as any).PLAYWRIGHT_TEST = true;
      const result = await connectToAp({
        url: 'archipelago.gg:38281',
        game: 'test-game',
        name: 'player1',
        sessionId: 'session-id'
      });

      expect(result).toBe(true);
      expect(apClient.login).not.toHaveBeenCalled();
    });

    it('successfully connects with valid options and password', async () => {
      const result = await connectToAp({
        url: 'wss://archipelago.gg:38281',
        game: 'test-game',
        name: 'player1',
        password: 'secret-password',
        sessionId: 'session-id'
      });

      expect(result).toBe(true);
      expect(apClient.login).toHaveBeenCalledWith(
        'archipelago.gg:38281',
        'player1',
        'test-game',
        expect.objectContaining({ password: 'secret-password' })
      );
    });

    it('handles connection failure and logs error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (apClient.login as any).mockRejectedValue(new Error('Connection timeout'));

      const result = await connectToAp({
        url: 'archipelago.gg:38281',
        game: 'test-game',
        name: 'player1',
        sessionId: 'session-id'
      });

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('[AP] Failed to connect:', 'Connection timeout');
      consoleSpy.mockRestore();
    });
  });

  describe('processReceivedItems via connectToAp', () => {
    it('ignores when unlockItemsCount is 0', async () => {
      apClient.items.received = [{ id: 700000 }, { id: 900000 }]; // Not in range 800001 - 801000

      await connectToAp({
        url: 'archipelago.gg:38281',
        game: 'test-game',
        name: 'player1',
        sessionId: 'session-id'
      });

      expect(pb.collection).not.toHaveBeenCalled();
    });

    it('updates node state to Available up to unlockItemsCount', async () => {
      apClient.items.received = [{ id: 800001 }, { id: 800002 }]; // 2 unlock items

      getFullListMock.mockResolvedValue([
        { id: 'node1', state: 'Checked' }, // 1 already unlocked
        { id: 'node2', state: 'Hidden' },  // Should become Available
        { id: 'node3', state: 'Hidden' },  // Should not be updated (unlockedCount becomes 2)
      ]);

      await connectToAp({
        url: 'archipelago.gg:38281',
        game: 'test-game',
        name: 'player1',
        sessionId: 'session-id'
      });

      expect(pb.collection).toHaveBeenCalledWith('map_nodes');
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(updateMock).toHaveBeenCalledWith('node2', { state: 'Available' });
    });

    it('breaks early if unlockedCount >= unlockItemsCount', async () => {
        apClient.items.received = [{ id: 800001 }]; // 1 unlock item

        getFullListMock.mockResolvedValue([
          { id: 'node1', state: 'Available' }, // 1 already unlocked
          { id: 'node2', state: 'Hidden' },
        ]);

        await connectToAp({
          url: 'archipelago.gg:38281',
          game: 'test-game',
          name: 'player1',
          sessionId: 'session-id'
        });

        expect(pb.collection).toHaveBeenCalledWith('map_nodes');
        expect(updateMock).not.toHaveBeenCalled();
    });
  });

  describe('sendLocationChecks', () => {
    beforeEach(() => {
        // Reset the testMode module level variable for each test by importing
        // a fresh state. However we can't easily reset internal module vars
        // without a full re-import, so we'll just handle test mode manually.
    });

    it('mocks checks and updates PB correctly in test mode', async () => {
        vi.useFakeTimers();

        // Ensure we are in test mode
        await connectToAp({
            url: 'test',
            game: 'test-game',
            name: 'player1',
            sessionId: 'session-id'
        });

        getFullListMock.mockImplementation((opts: any) => {
            if (opts.filter.includes('ap_location_id = 101')) {
                return Promise.resolve([{ id: 'mock-node-1', state: 'Available' }]);
            }
            if (opts.filter.includes('state = "Hidden"')) {
                return Promise.resolve([{ id: 'mock-node-2', state: 'Hidden' }]);
            }
            return Promise.resolve([]);
        });

        sendLocationChecks([101]);

        await vi.runAllTimersAsync();

        expect(updateMock).toHaveBeenCalledWith('mock-node-1', { state: 'Checked' });
        expect(updateMock).toHaveBeenCalledWith('mock-node-2', { state: 'Available' });

        vi.useRealTimers();
    });

    it('calls apClient.check with the correct ids when authenticated', async () => {
      // Force test mode OFF for this call since it was turned ON by previous tests
      vi.resetModules();
      const apModule = await import('./ap');

      // We must avoid calling connectToAp with 'test' to not trigger test mode
      await apModule.connectToAp({
        url: 'archipelago.gg:38281',
        game: 'test-game',
        name: 'player1',
        sessionId: 'session-id'
      });

      apModule.apClient.authenticated = true;
      apModule.sendLocationChecks([101, 102]);

      expect(apModule.apClient.check).toHaveBeenCalledWith(101, 102);
    });

    it('logs an error when not authenticated', async () => {
      vi.resetModules();
      const apModule = await import('./ap');
        // Ensure NOT in test mode
        await apModule.connectToAp({
            url: 'archipelago.gg:38281',
            game: 'test-game',
            name: 'player1',
            sessionId: 'session-id'
        });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      apModule.apClient.authenticated = false;

      apModule.sendLocationChecks([101]);

      expect(consoleSpy).toHaveBeenCalledWith('Cannot send checks — client is not authenticated.');
      expect(apModule.apClient.check).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

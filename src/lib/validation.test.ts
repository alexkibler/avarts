import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeFitFile, commitValidation } from './validation';
import { SportsLib } from '@sports-alliance/sports-lib';
import { pb } from './database';
import { SinglePlayerEngine } from './engine/SinglePlayerEngine';

vi.mock('@sports-alliance/sports-lib', () => ({
	SportsLib: {
		importFromFit: vi.fn()
	}
}));

vi.mock('./database', () => ({
	pb: {
		collection: vi.fn(() => ({
			getFullList: vi.fn(),
			update: vi.fn()
		}))
	}
}));

describe('validation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('analyzeFitFile should correctly extract stats and identify nodes', async () => {
		const mockActivity = {
			getStreamDataByTime: vi.fn((type) => {
				if (type === 'Location') {
					return [
						{ value: { latitude: 40.0, longitude: -80.0 } },
						{ value: { latitude: 40.0001, longitude: -80.0001 } }
					];
				}
				if (type === 'Altitude') {
					return [{ value: 100 }, { value: 110 }];
				}
				return [];
			}),
			hasStreamData: vi.fn((type) => type === 'Location' || type === 'Altitude'),
			getStat: vi.fn((type) => {
				const stats: Record<string, number> = {
					Distance: 1000,
					Ascent: 10,
					'Average Power': 200,
					'Average Heart Rate': 150
				};
				return stats[type] ? { getValue: () => stats[type] } : null;
			}),
			getDuration: vi.fn(() => ({ getValue: () => 600 })),
			getFirstActivity: function () {
				return this;
			}
		};

		(SportsLib.importFromFit as any).mockResolvedValue({
			getActivities: () => [mockActivity],
			getFirstActivity: () => mockActivity
		});

		const mockNodes = [
			{ id: 'node1', ap_location_id: 101, lat: 40.0, lon: -80.0, state: 'Available' },
			{ id: 'node2', ap_location_id: 102, lat: 41.0, lon: -81.0, state: 'Available' }
		];

		(pb.collection as any).mockReturnValue({
			getFullList: vi.fn().mockResolvedValue(mockNodes)
		});

		const mockFile = new File([new ArrayBuffer(10)], 'test.fit');
		const result = await analyzeFitFile(mockFile, 'session123');

		expect(result.stats.distanceMeters).toBe(1000);
		expect(result.stats.elevationGainMeters).toBe(10);
		expect(result.stats.avgPower).toBe(200);
		expect(result.stats.avgHR).toBe(150);
		expect(result.newlyCheckedNodes.length).toBe(1);
		expect(result.newlyCheckedNodes[0].ap_location_id).toBe(101);
		expect(result.path.length).toBe(2);
	});

	it('analyzeFitFile should throw error if no GPS data found', async () => {
		const mockActivity = {
			getStreamDataByTime: vi.fn(() => []),
			hasStreamData: vi.fn(() => false),
			hasPositionData: vi.fn(() => false),
			getActivities: function () {
				return [this];
			},
			getFirstActivity: function () {
				return this;
			}
		};

		(SportsLib.importFromFit as any).mockResolvedValue({
			getActivities: () => [mockActivity],
			getFirstActivity: () => mockActivity
		});

		const mockFile = new File([new ArrayBuffer(10)], 'empty.fit');
		await expect(analyzeFitFile(mockFile, 'session123')).rejects.toThrow(
			'No GPS data found in FIT file.'
		);
	});

	it('analyzeFitFile should handle missing power and HR stats', async () => {
		const mockActivity = {
			getStreamDataByTime: vi.fn((type) => {
				if (type === 'Position' || type === 'Location') {
					return [{ value: { latitude: 40, longitude: -80 } }];
				}
				return [];
			}),
			hasStreamData: vi.fn((type) => type === 'Position'),
			getStat: vi.fn(() => null), // No stats
			getDuration: vi.fn(() => ({ getValue: () => 100 })),
			getActivities: function () {
				return [this];
			},
			getFirstActivity: function () {
				return this;
			}
		};

		(SportsLib.importFromFit as any).mockResolvedValue({
			getActivities: () => [mockActivity],
			getFirstActivity: () => mockActivity
		});

		(pb.collection as any).mockReturnValue({
			getFullList: vi.fn().mockResolvedValue([])
		});

		const result = await analyzeFitFile(new File([], 'test.fit'), 'session');
		expect(result.stats.avgPower).toBeUndefined();
		expect(result.stats.avgHR).toBeUndefined();
		expect(result.stats.distanceMeters).toBe(0);
	});

	it('commitValidation should update DB and send AP checks', async () => {
		const newlyCheckedNodes = [{ id: 'node1', ap_location_id: 101, lat: 40.0, lon: -80.0 }];

		const updateMock = vi.fn().mockResolvedValue({});
		(pb.collection as any).mockReturnValue({
			update: updateMock
		});

		const engine = new SinglePlayerEngine();
		engine.sendLocationChecks = vi.fn();
		const messages = await commitValidation(newlyCheckedNodes, engine);

		expect(updateMock).toHaveBeenCalledWith('node1', { state: 'Checked' }, { requestKey: null });
		expect(engine.sendLocationChecks).toHaveBeenCalledWith([101]);
		expect(messages).toContain('Unlocked Location 101 at [40, -80]!');
	});
});

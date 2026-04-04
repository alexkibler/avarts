import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateFitFile } from './validation';
import { pb } from '$lib/pb';
import { sendLocationChecks } from '$lib/ap';
// @ts-ignore
import FitParser from 'fit-file-parser';

vi.mock('$lib/pb', () => ({
	pb: {
		collection: vi.fn(() => ({
			getFullList: vi.fn(),
			update: vi.fn()
		}))
	}
}));

vi.mock('$lib/ap', () => ({
	sendLocationChecks: vi.fn()
}));

let parseMockImpl = vi.fn((data, cb) => cb(null, { activity: { sessions: [] } }));

vi.mock('fit-file-parser', () => {
	const MockFitParser = class {
		parse = (data: ArrayBuffer, cb: (err: Error | null, data: unknown) => void) =>
			parseMockImpl(data, cb);
	};
	return { default: MockFitParser };
});

describe('validateFitFile', () => {
	let fileMock: File;
	let getFullListMock: ReturnType<typeof vi.fn>;
	let updateMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		parseMockImpl = vi.fn((data, cb) => cb(null, { activity: { sessions: [] } }));

		// Mock FileReader
		class MockFileReader {
			onload: ((this: any, ev: ProgressEvent<FileReader>) => any) | null = null;
			onerror: ((this: any, ev: ProgressEvent<FileReader>) => any) | null = null;
			readAsArrayBuffer(file: File) {
				if (this.onload) {
					this.onload.call(this, { target: { result: new ArrayBuffer(8) } } as any);
				}
			}
		}
		vi.stubGlobal('FileReader', MockFileReader);

		fileMock = new File(['mock content'], 'test.fit', { type: 'application/octet-stream' });

		getFullListMock = vi.fn().mockResolvedValue([]);
		updateMock = vi.fn().mockResolvedValue({});
		(pb.collection as ReturnType<typeof vi.fn>).mockReturnValue({
			getFullList: getFullListMock,
			update: updateMock
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('fails when the file fails to read', async () => {
		class ErrorFileReader {
			onload: ((this: any, ev: ProgressEvent<FileReader>) => any) | null = null;
			onerror: ((this: any, ev: ProgressEvent<FileReader>) => any) | null = null;
			readAsArrayBuffer(file: File) {
				if (this.onerror) {
					this.onerror.call(this, new ProgressEvent('error') as any);
				}
			}
		}
		vi.stubGlobal('FileReader', ErrorFileReader);

		await expect(validateFitFile(fileMock, 'session-id')).rejects.toEqual('File reader error.');
	});

	it('fails when the target result is null', async () => {
		class NullFileReader {
			onload: ((this: any, ev: ProgressEvent<FileReader>) => any) | null = null;
			onerror: ((this: any, ev: ProgressEvent<FileReader>) => any) | null = null;
			readAsArrayBuffer(file: File) {
				if (this.onload) {
					this.onload.call(this, { target: { result: null } } as any);
				}
			}
		}
		vi.stubGlobal('FileReader', NullFileReader);

		await expect(validateFitFile(fileMock, 'session-id')).rejects.toEqual('Failed to read file.');
	});

	it('fails when FitParser fails to parse the file', async () => {
		parseMockImpl = vi.fn((data: any, cb: any) => {
			cb(new Error('Parse error'), null);
		});

		await expect(validateFitFile(fileMock, 'session-id')).rejects.toEqual(
			'Failed to parse FIT file.'
		);
	});

	it('returns a message when FIT file has no GPS data', async () => {
		parseMockImpl = vi.fn((data: any, cb: any) => {
			cb(null, { activity: { sessions: [] } });
		});

		const result = await validateFitFile(fileMock, 'session-id');
		expect(result).toEqual(['No GPS data found in FIT file.']);
	});

	it('returns a message when there are no available nodes to check', async () => {
		parseMockImpl = vi.fn((data: any, cb: any) => {
			cb(null, {
				activity: {
					sessions: [
						{
							laps: [
								{
									records: [{ position_lat: 40.0, position_long: -75.0 }]
								}
							]
						}
					]
				}
			});
		});

		getFullListMock.mockResolvedValue([]);

		const result = await validateFitFile(fileMock, 'session-id');
		expect(result).toEqual(['No available nodes to check.']);
	});

	it('correctly identifies nodes outside the 30-meter radius', async () => {
		parseMockImpl = vi.fn((data: any, cb: any) => {
			cb(null, {
				activity: {
					sessions: [
						{
							laps: [
								{
									records: [
										{ position_lat: 40.0, position_long: -75.0 } // Coordinates
									]
								}
							]
						}
					]
				}
			});
		});

		getFullListMock.mockResolvedValue([
			{ id: 'node1', lat: 40.1, lon: -75.1, ap_location_id: 101, state: 'Available' } // Distant coordinates
		]);

		const result = await validateFitFile(fileMock, 'session-id');

		expect(result).toEqual(['No available locations were reached in this ride.']);
		expect(updateMock).not.toHaveBeenCalled();
		expect(sendLocationChecks).not.toHaveBeenCalled();
	});

	it('correctly identifies nodes within the 30-meter radius', async () => {
		// A short distance simulation: ~10 meters apart at 40 deg latitude.
		const lat1 = 40.0;
		const lon1 = -75.0;
		const lat2 = 40.00009; // slight offset within 30m
		const lon2 = -75.0;

		parseMockImpl = vi.fn((data: any, cb: any) => {
			cb(null, {
				activity: {
					sessions: [
						{
							laps: [
								{
									records: [{ position_lat: lat1, position_long: lon1 }]
								}
							]
						}
					]
				}
			});
		});

		getFullListMock.mockResolvedValue([
			{ id: 'node1', lat: lat2, lon: lon2, ap_location_id: 101, state: 'Available' }
		]);

		const result = await validateFitFile(fileMock, 'session-id');

		expect(result).toContain('Unlocked Location 101 at [40.00009, -75]!');
		expect(result).toContain('Successfully validated 1 location(s) and notified Archipelago.');
		expect(updateMock).toHaveBeenCalledWith('node1', { state: 'Checked' });
		expect(sendLocationChecks).toHaveBeenCalledWith([101]);
	});

	it('handles database update failures', async () => {
		const lat1 = 40.0;
		const lon1 = -75.0;

		parseMockImpl = vi.fn((data: unknown, cb: (err: Error | null, data: any) => void) => {
			cb(null, {
				activity: {
					sessions: [
						{
							laps: [
								{
									records: [{ position_lat: lat1, position_long: lon1 }]
								}
							]
						}
					]
				}
			});
		});

		getFullListMock.mockResolvedValue([
			{ id: 'node1', lat: lat1, lon: lon1, ap_location_id: 101, state: 'Available' }
		]);

		updateMock.mockRejectedValue(new Error('DB Error'));

		await expect(validateFitFile(fileMock, 'session-id')).rejects.toEqual(
			'An error occurred during database operations.'
		);
	});
});

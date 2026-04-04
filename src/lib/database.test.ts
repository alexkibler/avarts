import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLink } from './database';
import { pb } from './database';

vi.mock('pocketbase', () => {
  const PocketBaseMock = class {
    autoCancellation = vi.fn();
    collection = vi.fn(() => ({
      getOne: vi.fn(),
    }));
    files = {
      getUrl: vi.fn(),
    };
  };
  return { default: PocketBaseMock };
});

describe('database.ts module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getLink', () => {
    it('returns the correct URL response for a valid record', async () => {
      const mockRecord = { id: 'record-123', dataset: 'my-dataset-file.csv' };
      const getOneMock = vi.fn().mockResolvedValue(mockRecord);
      (pb.collection as any).mockReturnValue({ getOne: getOneMock });

      const mockUrl = 'http://localhost:8090/api/files/coll/record-123/my-dataset-file.csv';
      (pb.files.getUrl as any).mockReturnValue(mockUrl);

      const fetchMock = vi.fn().mockResolvedValue(new Response('Mock Data'));
      vi.stubGlobal('fetch', fetchMock);

      const response = await getLink('my-collection', 'record-123');

      expect(pb.collection).toHaveBeenCalledWith('my-collection');
      expect(getOneMock).toHaveBeenCalledWith('record-123');
      expect(pb.files.getUrl).toHaveBeenCalledWith(mockRecord, 'my-dataset-file.csv');
      expect(fetchMock).toHaveBeenCalledWith(mockUrl);
      expect(response).toBeInstanceOf(Response);
    });

    it('handles missing records by propagating the error', async () => {
      const getOneMock = vi.fn().mockRejectedValue(new Error('Record not found'));
      (pb.collection as any).mockReturnValue({ getOne: getOneMock });

      await expect(getLink('my-collection', 'invalid-id')).rejects.toThrowError('Record not found');
    });
  });
});

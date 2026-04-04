import { cacheAside } from './cache';

describe('cacheAside', () => {
  let mockRedis: any;
  let fetcher: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    fetcher = jest.fn();
  });

  it('should return cached value on cache hit', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ id: 1, name: 'cached' }));

    const result = await cacheAside(mockRedis, 'test-key', 60, fetcher);

    expect(result).toEqual({ id: 1, name: 'cached' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('should fetch and cache on cache miss with lock acquired', async () => {
    mockRedis.get.mockResolvedValueOnce(null); // cache miss
    mockRedis.set.mockResolvedValueOnce('OK'); // lock acquired

    const data = { id: 2, name: 'fetched' };
    fetcher.mockResolvedValue(data);

    const result = await cacheAside(mockRedis, 'test-key', 120, fetcher);

    expect(result).toEqual(data);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mockRedis.set).toHaveBeenCalledWith('lock:test-key', '1', 'EX', 10, 'NX');
    expect(mockRedis.setex).toHaveBeenCalledWith('test-key', 120, JSON.stringify(data));
    expect(mockRedis.del).toHaveBeenCalledWith('lock:test-key');
  });

  it('should not cache null results', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set.mockResolvedValueOnce('OK'); // lock acquired
    fetcher.mockResolvedValue(null);

    const result = await cacheAside(mockRedis, 'test-key', 60, fetcher);

    expect(result).toBeNull();
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  it('should not cache undefined results', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set.mockResolvedValueOnce('OK'); // lock acquired
    fetcher.mockResolvedValue(undefined);

    const result = await cacheAside(mockRedis, 'test-key', 60, fetcher);

    expect(result).toBeUndefined();
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });

  it('should release lock even if fetcher throws', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set.mockResolvedValueOnce('OK'); // lock acquired
    fetcher.mockRejectedValue(new Error('DB error'));

    await expect(cacheAside(mockRedis, 'test-key', 60, fetcher)).rejects.toThrow('DB error');
    expect(mockRedis.del).toHaveBeenCalledWith('lock:test-key');
  });

  it('should wait and retry if lock not acquired', async () => {
    mockRedis.get
      .mockResolvedValueOnce(null) // initial cache miss
      .mockResolvedValueOnce(null) // retry 1 cache miss
      .mockResolvedValueOnce(JSON.stringify({ id: 3, name: 'from-other-caller' })); // retry 2 cache hit
    mockRedis.set.mockResolvedValueOnce(null); // lock NOT acquired

    const result = await cacheAside(mockRedis, 'test-key', 60, fetcher);

    expect(result).toEqual({ id: 3, name: 'from-other-caller' });
    expect(fetcher).not.toHaveBeenCalled();
  }, 10000);

  it('should fetch directly if lock not acquired and retries exhausted', async () => {
    mockRedis.get
      .mockResolvedValueOnce(null) // initial miss
      .mockResolvedValueOnce(null) // retry 1
      .mockResolvedValueOnce(null) // retry 2
      .mockResolvedValueOnce(null); // retry 3
    mockRedis.set.mockResolvedValueOnce(null); // lock not acquired

    const data = { id: 4, name: 'fallback' };
    fetcher.mockResolvedValue(data);

    const result = await cacheAside(mockRedis, 'test-key', 60, fetcher);

    expect(result).toEqual(data);
    expect(fetcher).toHaveBeenCalledTimes(1);
  }, 10000);

  it('should handle array values', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockRedis.set.mockResolvedValueOnce('OK');

    const data = [{ id: 1 }, { id: 2 }];
    fetcher.mockResolvedValue(data);

    const result = await cacheAside(mockRedis, 'list-key', 60, fetcher);

    expect(result).toEqual(data);
    expect(mockRedis.setex).toHaveBeenCalledWith('list-key', 60, JSON.stringify(data));
  });

  it('should handle string values', async () => {
    mockRedis.get.mockResolvedValueOnce(JSON.stringify('simple-string'));

    const result = await cacheAside(mockRedis, 'str-key', 60, fetcher);

    expect(result).toBe('simple-string');
  });
});

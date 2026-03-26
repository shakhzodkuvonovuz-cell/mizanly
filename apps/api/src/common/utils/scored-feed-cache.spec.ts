import { ScoredFeedCache, ScoredItem } from './scored-feed-cache';

/**
 * Mock Redis that implements the sorted set operations used by ScoredFeedCache.
 * Uses an in-memory Map to simulate Redis sorted sets.
 */
function createMockRedis() {
  const sortedSets = new Map<string, { score: number; member: string }[]>();
  const ttls = new Map<string, number>();

  const redis = {
    zcard: jest.fn(async (key: string) => {
      const set = sortedSets.get(key);
      return set ? set.length : 0;
    }),

    zadd: jest.fn(async (key: string, ...args: (string | number)[]) => {
      if (!sortedSets.has(key)) sortedSets.set(key, []);
      const set = sortedSets.get(key)!;
      for (let i = 0; i < args.length; i += 2) {
        const score = Number(args[i]);
        const member = String(args[i + 1]);
        // Remove existing member with same value (ZADD replaces)
        const existingIdx = set.findIndex(s => s.member === member);
        if (existingIdx !== -1) set.splice(existingIdx, 1);
        set.push({ score, member });
      }
      return args.length / 2;
    }),

    zrevrange: jest.fn(async (key: string, start: number, stop: number) => {
      const set = sortedSets.get(key);
      if (!set) return [];
      // Sort descending by score
      const sorted = [...set].sort((a, b) => b.score - a.score);
      // Redis ZREVRANGE is inclusive on both ends
      return sorted.slice(start, stop + 1).map(s => s.member);
    }),

    del: jest.fn(async (...keys: string[]) => {
      let deleted = 0;
      for (const key of keys) {
        if (sortedSets.has(key)) {
          sortedSets.delete(key);
          deleted++;
        }
        ttls.delete(key);
      }
      return deleted;
    }),

    expire: jest.fn(async (key: string, seconds: number) => {
      ttls.set(key, seconds);
      return 1;
    }),

    pipeline: jest.fn(() => {
      const commands: (() => Promise<unknown>)[] = [];
      const pipe = {
        del: (...keys: string[]) => {
          commands.push(() => redis.del(...keys));
          return pipe;
        },
        zadd: (key: string, ...args: (string | number)[]) => {
          commands.push(() => redis.zadd(key, ...args));
          return pipe;
        },
        expire: (key: string, seconds: number) => {
          commands.push(() => redis.expire(key, seconds));
          return pipe;
        },
        exec: async () => {
          const results: [Error | null, unknown][] = [];
          for (const cmd of commands) {
            try {
              const result = await cmd();
              results.push([null, result]);
            } catch (err) {
              results.push([err as Error, null]);
            }
          }
          return results;
        },
      };
      return pipe;
    }),

    // Expose internals for test assertions
    _sortedSets: sortedSets,
    _ttls: ttls,
  };

  return redis;
}

describe('ScoredFeedCache', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let cache: ScoredFeedCache;

  beforeEach(() => {
    redis = createMockRedis();
    cache = new ScoredFeedCache(redis as any);
  });

  function makeItems(count: number, baseScore = 100): ScoredItem[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `item-${i}`,
      score: baseScore - i, // descending scores
      title: `Item ${i}`,
    }));
  }

  describe('cache miss', () => {
    it('should call scoreFn when cache is empty and return page 0', async () => {
      const items = makeItems(5);
      const scoreFn = jest.fn().mockResolvedValue(items);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      expect(scoreFn).toHaveBeenCalledTimes(1);
      expect(result.items).toHaveLength(5);
      expect(result.page).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should populate Redis sorted set via pipeline', async () => {
      const items = makeItems(3);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      // Pipeline should have been called
      expect(redis.pipeline).toHaveBeenCalled();
      // Items should be in the sorted set
      const setSize = await redis.zcard('sfeed:test');
      expect(setSize).toBe(3);
    });

    it('should set TTL on the sorted set', async () => {
      const items = makeItems(3);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 120, 300, scoreFn);

      expect(redis._ttls.get('sfeed:test')).toBe(300);
    });

    it('should return empty page when scoreFn returns no items', async () => {
      const scoreFn = jest.fn().mockResolvedValue([]);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.page).toBe(0);
      // Should not populate redis when empty
      expect(redis.pipeline).not.toHaveBeenCalled();
    });
  });

  describe('cache hit', () => {
    it('should NOT call scoreFn when cache exists', async () => {
      const items = makeItems(5);
      const scoreFn = jest.fn().mockResolvedValue(items);

      // First call — populates cache
      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);
      expect(scoreFn).toHaveBeenCalledTimes(1);

      // Second call — cache hit
      const scoreFn2 = jest.fn().mockResolvedValue([]);
      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn2);

      expect(scoreFn2).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(5);
    });

    it('should read subsequent pages without re-scoring', async () => {
      const items = makeItems(50);
      const scoreFn = jest.fn().mockResolvedValue(items);

      // Page 0
      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);
      expect(scoreFn).toHaveBeenCalledTimes(1);

      // Page 1 — should not call scoreFn
      const scoreFn2 = jest.fn().mockResolvedValue([]);
      const result = await cache.getPage('sfeed:test', 1, 20, 120, scoreFn2);

      expect(scoreFn2).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(20);
      expect(result.page).toBe(1);
    });
  });

  describe('pagination', () => {
    it('should return correct page sizes with hasMore', async () => {
      const items = makeItems(50);
      const scoreFn = jest.fn().mockResolvedValue(items);

      // Page 0: items 0-19, hasMore = true
      const page0 = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);
      expect(page0.items).toHaveLength(20);
      expect(page0.hasMore).toBe(true);
      expect(page0.page).toBe(0);
    });

    it('should return hasMore=false on the last page', async () => {
      const items = makeItems(45);
      const scoreFn = jest.fn().mockResolvedValue(items);

      // Populate cache
      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      // Page 2: items 40-44, hasMore = false
      const scoreFn2 = jest.fn();
      const page2 = await cache.getPage('sfeed:test', 2, 20, 120, scoreFn2);
      expect(page2.items).toHaveLength(5);
      expect(page2.hasMore).toBe(false);
    });

    it('should return items in descending score order', async () => {
      const items: ScoredItem[] = [
        { id: 'low', score: 10 },
        { id: 'high', score: 100 },
        { id: 'mid', score: 50 },
      ];
      const scoreFn = jest.fn().mockResolvedValue(items);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      expect(result.items[0].id).toBe('high');
      expect(result.items[1].id).toBe('mid');
      expect(result.items[2].id).toBe('low');
    });

    it('page 2 should contain different items than page 1 (no duplicates)', async () => {
      const items = makeItems(50);
      const scoreFn = jest.fn().mockResolvedValue(items);

      // Populate
      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      const noOp = jest.fn();
      const page0 = await cache.getPage('sfeed:test', 0, 20, 120, noOp);
      const page1 = await cache.getPage('sfeed:test', 1, 20, 120, noOp);
      const page2 = await cache.getPage('sfeed:test', 2, 20, 120, noOp);

      const page0Ids = new Set(page0.items.map(i => i.id));
      const page1Ids = new Set(page1.items.map(i => i.id));
      const page2Ids = new Set(page2.items.map(i => i.id));

      // No overlap between pages
      for (const id of page1Ids) {
        expect(page0Ids.has(id)).toBe(false);
      }
      for (const id of page2Ids) {
        expect(page0Ids.has(id)).toBe(false);
        expect(page1Ids.has(id)).toBe(false);
      }

      // Combined should have all 50 items
      const allIds = new Set([...page0Ids, ...page1Ids, ...page2Ids]);
      expect(allIds.size).toBe(50);
    });

    it('should handle exact page boundary (items = pageSize)', async () => {
      const items = makeItems(20);
      const scoreFn = jest.fn().mockResolvedValue(items);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      expect(result.items).toHaveLength(20);
      expect(result.hasMore).toBe(false);
    });

    it('should handle page beyond available data', async () => {
      const items = makeItems(5);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      const noOp = jest.fn();
      const result = await cache.getPage('sfeed:test', 5, 20, 120, noOp);

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('invalidate', () => {
    it('should clear the cache so next request re-scores', async () => {
      const items = makeItems(10);
      const scoreFn = jest.fn().mockResolvedValue(items);

      // Populate cache
      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);
      expect(scoreFn).toHaveBeenCalledTimes(1);

      // Invalidate
      await cache.invalidate('sfeed:test');

      // Next request should call scoreFn again
      const newItems = makeItems(5, 200);
      const scoreFn2 = jest.fn().mockResolvedValue(newItems);
      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn2);

      expect(scoreFn2).toHaveBeenCalledTimes(1);
      expect(result.items).toHaveLength(5);
      expect(result.items[0].score).toBe(200); // new items
    });
  });

  describe('large dataset', () => {
    it('should correctly paginate 500 items across 25 pages', async () => {
      const items = makeItems(500);
      const scoreFn = jest.fn().mockResolvedValue(items);

      // Populate on first page
      const page0 = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);
      expect(page0.items).toHaveLength(20);
      expect(page0.hasMore).toBe(true);
      expect(scoreFn).toHaveBeenCalledTimes(1);

      const noOp = jest.fn();

      // Page 12 (middle)
      const page12 = await cache.getPage('sfeed:test', 12, 20, 120, noOp);
      expect(page12.items).toHaveLength(20);
      expect(page12.hasMore).toBe(true);
      expect(page12.items[0].id).toBe('item-240'); // 12*20 = 240th item (0-indexed)

      // Last page (page 24: items 480-499)
      const page24 = await cache.getPage('sfeed:test', 24, 20, 120, noOp);
      expect(page24.items).toHaveLength(20);
      expect(page24.hasMore).toBe(false);

      // Beyond last page
      const page25 = await cache.getPage('sfeed:test', 25, 20, 120, noOp);
      expect(page25.items).toHaveLength(0);
      expect(page25.hasMore).toBe(false);

      // scoreFn should never have been called again
      expect(noOp).not.toHaveBeenCalled();
    });

    it('should chunk ZADD operations for large datasets', async () => {
      const items = makeItems(500);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      // After population, sorted set should have all 500 items
      const count = await redis.zcard('sfeed:test');
      expect(count).toBe(500);
    });
  });

  describe('metadata preservation', () => {
    it('should preserve additional metadata fields through serialization', async () => {
      const items: ScoredItem[] = [
        { id: 'p1', score: 100, title: 'Post 1', likesCount: 42, userId: 'u1' },
        { id: 'p2', score: 50, title: 'Post 2', likesCount: 10, userId: 'u2' },
      ];
      const scoreFn = jest.fn().mockResolvedValue(items);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      expect(result.items[0]).toEqual({ id: 'p1', score: 100, title: 'Post 1', likesCount: 42, userId: 'u1' });
      expect(result.items[1]).toEqual({ id: 'p2', score: 50, title: 'Post 2', likesCount: 10, userId: 'u2' });
    });
  });

  describe('edge cases', () => {
    it('should handle items with score 0', async () => {
      const items: ScoredItem[] = [
        { id: 'zero', score: 0 },
        { id: 'positive', score: 10 },
      ];
      const scoreFn = jest.fn().mockResolvedValue(items);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('positive');
      expect(result.items[1].id).toBe('zero');
    });

    it('should handle single item', async () => {
      const items: ScoredItem[] = [{ id: 'only', score: 42 }];
      const scoreFn = jest.fn().mockResolvedValue(items);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('should handle very small page size', async () => {
      const items = makeItems(10);
      const scoreFn = jest.fn().mockResolvedValue(items);

      const page0 = await cache.getPage('sfeed:test', 0, 2, 120, scoreFn);
      expect(page0.items).toHaveLength(2);
      expect(page0.hasMore).toBe(true);

      const noOp = jest.fn();
      const page4 = await cache.getPage('sfeed:test', 4, 2, 120, noOp);
      expect(page4.items).toHaveLength(2);
      expect(page4.hasMore).toBe(false);
    });

    it('should handle negative scores', async () => {
      const items: ScoredItem[] = [
        { id: 'neg', score: -5 },
        { id: 'pos', score: 5 },
        { id: 'zero', score: 0 },
      ];
      const scoreFn = jest.fn().mockResolvedValue(items);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      expect(result.items[0].id).toBe('pos');
      expect(result.items[1].id).toBe('zero');
      expect(result.items[2].id).toBe('neg');
    });
  });
});

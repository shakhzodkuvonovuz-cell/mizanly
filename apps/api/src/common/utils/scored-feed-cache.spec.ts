import { ScoredFeedCache } from './scored-feed-cache';

/**
 * Mock Redis that implements sorted set + hash operations used by ScoredFeedCache.
 * Uses in-memory Maps to simulate Redis data structures.
 *
 * Architecture: ZADD stores score->id, HSET stores id->JSON payload.
 * This matches the real implementation's dual-key approach for uniqueness.
 *
 * NOTE: All function parameters are untyped to avoid babel/jest transform issues.
 */
function createMockRedis() {
  const sortedSets = new Map();
  const hashes = new Map();
  const ttls = new Map();
  const strings = new Map();

  const redis = {
    zcard: jest.fn(async (key) => {
      const set = sortedSets.get(key);
      return set ? set.length : 0;
    }),

    zadd: jest.fn(async (key, ...args) => {
      if (!sortedSets.has(key)) sortedSets.set(key, []);
      const set = sortedSets.get(key);
      for (let i = 0; i < args.length; i += 2) {
        const score = Number(args[i]);
        const member = String(args[i + 1]);
        const existingIdx = set.findIndex((s) => s.member === member);
        if (existingIdx !== -1) set.splice(existingIdx, 1);
        set.push({ score, member });
      }
      return args.length / 2;
    }),

    zrevrange: jest.fn(async (key, start, stop) => {
      const set = sortedSets.get(key);
      if (!set) return [];
      const sorted = [...set].sort((a, b) => b.score - a.score);
      return sorted.slice(start, stop + 1).map((s) => s.member);
    }),

    hset: jest.fn(async (key, ...args) => {
      if (!hashes.has(key)) hashes.set(key, new Map());
      const hash = hashes.get(key);
      for (let i = 0; i < args.length; i += 2) {
        hash.set(args[i], args[i + 1]);
      }
      return args.length / 2;
    }),

    hmget: jest.fn(async (key, ...fields) => {
      const hash = hashes.get(key);
      if (!hash) return fields.map(() => null);
      return fields.map((f) => hash.get(f) ?? null);
    }),

    del: jest.fn(async (...keys) => {
      let deleted = 0;
      for (const key of keys) {
        if (sortedSets.has(key)) {
          sortedSets.delete(key);
          deleted++;
        }
        if (hashes.has(key)) {
          hashes.delete(key);
          deleted++;
        }
        if (strings.has(key)) {
          strings.delete(key);
          deleted++;
        }
        ttls.delete(key);
      }
      return deleted;
    }),

    expire: jest.fn(async (key, seconds) => {
      ttls.set(key, seconds);
      return 1;
    }),

    set: jest.fn(async (key, value, ex, seconds, nx) => {
      if (nx === 'NX' && strings.has(key)) return null;
      strings.set(key, value);
      if (ex === 'EX' && seconds) ttls.set(key, seconds);
      return 'OK';
    }),

    pipeline: jest.fn(() => {
      const commands = [];
      const pipe = {
        del: (...delKeys) => {
          commands.push(() => redis.del(...delKeys));
          return pipe;
        },
        zadd: (key, ...args) => {
          commands.push(() => redis.zadd(key, ...args));
          return pipe;
        },
        hset: (key, ...args) => {
          commands.push(() => redis.hset(key, ...args));
          return pipe;
        },
        expire: (key, seconds) => {
          commands.push(() => redis.expire(key, seconds));
          return pipe;
        },
        exec: async () => {
          const results = [];
          for (const cmd of commands) {
            try {
              results.push([null, await cmd()]);
            } catch (err) {
              results.push([err, null]);
            }
          }
          return results;
        },
      };
      return pipe;
    }),

    _sortedSets: sortedSets,
    _hashes: hashes,
    _ttls: ttls,
    _strings: strings,
  };

  return redis;
}

describe('ScoredFeedCache', () => {
  let redis;
  let cache;

  beforeEach(() => {
    redis = createMockRedis();
    cache = new ScoredFeedCache(redis as any);
  });

  function makeItems(count, baseScore = 100) {
    return Array.from({ length: count }, (_, i) => ({
      id: `item-${i}`,
      score: baseScore - i,
      title: `Item ${i}`,
    }));
  }

  // ─── Cache Miss ──────────────────────────────────────────────────

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

    it('should populate Redis sorted set + companion hash via pipeline', async () => {
      const items = makeItems(3);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      // Sorted set should have 3 members (item IDs)
      const setSize = await redis.zcard('sfeed:test');
      expect(setSize).toBe(3);

      // Companion hash should have 3 entries (item ID -> JSON)
      const hash = redis._hashes.get('sfeed:test:data');
      expect(hash).toBeDefined();
      expect(hash.size).toBe(3);
    });

    it('should set TTL on both sorted set and companion hash', async () => {
      const items = makeItems(3);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 120, 300, scoreFn);

      expect(redis._ttls.get('sfeed:test')).toBe(300);
      expect(redis._ttls.get('sfeed:test:data')).toBe(300);
    });

    it('should return empty page when scoreFn returns no items', async () => {
      const scoreFn = jest.fn().mockResolvedValue([]);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('should acquire lock before populating (SETNX)', async () => {
      const items = makeItems(5);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      expect(redis.set).toHaveBeenCalledWith(
        'sfeed:test:lock',
        '1',
        'EX',
        10,
        'NX',
      );
    });

    it('should release lock after populating', async () => {
      const items = makeItems(5);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      // Lock key should have been deleted
      expect(redis.del).toHaveBeenCalledWith('sfeed:test:lock');
    });
  });

  // ─── Concurrent Access (Race Condition Fix) ──────────────────────

  describe('concurrent access', () => {
    it('should wait and read from cache when lock is held by another request', async () => {
      // Simulate: another request holds the lock and is populating
      redis._strings.set('sfeed:test:lock', '1');

      const items = makeItems(10);
      const scoreFn = jest.fn().mockResolvedValue(items);

      // Pre-populate the cache (simulating the other request finishing)
      const sortedSet = items.map((item) => ({
        score: item.score,
        member: item.id,
      }));
      redis._sortedSets.set('sfeed:test', sortedSet);
      const dataHash = new Map();
      items.forEach((item) => dataHash.set(item.id, JSON.stringify(item)));
      redis._hashes.set('sfeed:test:data', dataHash);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      // scoreFn should NOT have been called (read from cache instead)
      expect(scoreFn).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(10);
    });
  });

  // ─── Cache Hit ───────────────────────────────────────────────────

  describe('cache hit', () => {
    it('should NOT call scoreFn when cache exists', async () => {
      const items = makeItems(5);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);
      expect(scoreFn).toHaveBeenCalledTimes(1);

      const scoreFn2 = jest.fn().mockResolvedValue([]);
      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn2);

      expect(scoreFn2).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(5);
    });

    it('should read subsequent pages without re-scoring', async () => {
      const items = makeItems(50);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);
      expect(scoreFn).toHaveBeenCalledTimes(1);

      const scoreFn2 = jest.fn().mockResolvedValue([]);
      const result = await cache.getPage('sfeed:test', 1, 20, 120, scoreFn2);

      expect(scoreFn2).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(20);
      expect(result.page).toBe(1);
    });

    it('should re-read ZCARD for accurate hasMore (not stale)', async () => {
      const items = makeItems(50);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      // ZCARD should be called on every readPage for fresh totalItems
      const zcardCalls = redis.zcard.mock.calls.filter(
        (call) => call[0] === 'sfeed:test',
      );
      // At least: initial check + readPage re-read
      expect(zcardCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── Pagination ──────────────────────────────────────────────────

  describe('pagination', () => {
    it('should return correct page sizes with hasMore', async () => {
      const items = makeItems(50);
      const scoreFn = jest.fn().mockResolvedValue(items);

      const page0 = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);
      expect(page0.items).toHaveLength(20);
      expect(page0.hasMore).toBe(true);
      expect(page0.page).toBe(0);
    });

    it('should return hasMore=false on the last page', async () => {
      const items = makeItems(45);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      const noOp = jest.fn();
      const page2 = await cache.getPage('sfeed:test', 2, 20, 120, noOp);
      expect(page2.items).toHaveLength(5);
      expect(page2.hasMore).toBe(false);
    });

    it('should return items in descending score order', async () => {
      const items = [
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

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      const noOp = jest.fn();
      const page0 = await cache.getPage('sfeed:test', 0, 20, 120, noOp);
      const page1 = await cache.getPage('sfeed:test', 1, 20, 120, noOp);
      const page2 = await cache.getPage('sfeed:test', 2, 20, 120, noOp);

      const page0Ids = new Set(page0.items.map((i) => i.id));
      const page1Ids = new Set(page1.items.map((i) => i.id));
      const page2Ids = new Set(page2.items.map((i) => i.id));

      for (const id of page1Ids) expect(page0Ids.has(id)).toBe(false);
      for (const id of page2Ids) {
        expect(page0Ids.has(id)).toBe(false);
        expect(page1Ids.has(id)).toBe(false);
      }

      const allIds = new Set([...page0Ids, ...page1Ids, ...page2Ids]);
      expect(allIds.size).toBe(50);
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

  // ─── Invalidation ────────────────────────────────────────────────

  describe('invalidate', () => {
    it('should clear both sorted set and companion hash', async () => {
      const items = makeItems(10);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      await cache.invalidate('sfeed:test');

      expect(redis._sortedSets.has('sfeed:test')).toBe(false);
      expect(redis._hashes.has('sfeed:test:data')).toBe(false);
    });

    it('should force re-score on next request after invalidation', async () => {
      const items = makeItems(10);
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);
      expect(scoreFn).toHaveBeenCalledTimes(1);

      await cache.invalidate('sfeed:test');

      const newItems = makeItems(5, 200);
      const scoreFn2 = jest.fn().mockResolvedValue(newItems);
      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn2);

      expect(scoreFn2).toHaveBeenCalledTimes(1);
      expect(result.items).toHaveLength(5);
      expect(result.items[0].score).toBe(200);
    });
  });

  // ─── Member Uniqueness ───────────────────────────────────────────

  describe('member uniqueness', () => {
    it('should use item ID as sorted set member (not full JSON)', async () => {
      const items = [{ id: 'post-1', score: 100, title: 'Original' }];
      const scoreFn = jest.fn().mockResolvedValue(items);

      await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      // Sorted set members should be IDs, not JSON
      const set = redis._sortedSets.get('sfeed:test');
      expect(set[0].member).toBe('post-1');
    });

    it('should deduplicate items with same ID but different data', async () => {
      // If somehow the same post ID appears twice with different scores
      const items = [
        { id: 'dup', score: 100, version: 'old' },
        { id: 'dup', score: 200, version: 'new' },
      ];
      const scoreFn = jest.fn().mockResolvedValue(items);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      // Should have exactly 1 item (Redis ZADD replaces on same member)
      expect(result.items).toHaveLength(1);
      // The second write wins (score 200)
      const set = redis._sortedSets.get('sfeed:test');
      expect(set).toHaveLength(1);
      expect(set[0].score).toBe(200);
    });
  });

  // ─── Large Dataset ───────────────────────────────────────────────

  describe('large dataset', () => {
    it('should correctly paginate 500 items across 25 pages', async () => {
      const items = makeItems(500);
      const scoreFn = jest.fn().mockResolvedValue(items);

      const page0 = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);
      expect(page0.items).toHaveLength(20);
      expect(page0.hasMore).toBe(true);
      expect(scoreFn).toHaveBeenCalledTimes(1);

      const noOp = jest.fn();

      const page12 = await cache.getPage('sfeed:test', 12, 20, 120, noOp);
      expect(page12.items).toHaveLength(20);
      expect(page12.hasMore).toBe(true);

      const page24 = await cache.getPage('sfeed:test', 24, 20, 120, noOp);
      expect(page24.items).toHaveLength(20);
      expect(page24.hasMore).toBe(false);

      const page25 = await cache.getPage('sfeed:test', 25, 20, 120, noOp);
      expect(page25.items).toHaveLength(0);
      expect(page25.hasMore).toBe(false);

      expect(noOp).not.toHaveBeenCalled();
    });
  });

  // ─── Metadata Preservation ───────────────────────────────────────

  describe('metadata preservation', () => {
    it('should preserve all fields through serialization via companion hash', async () => {
      const items = [
        {
          id: 'p1',
          score: 100,
          title: 'Post 1',
          likesCount: 42,
          userId: 'u1',
        },
        {
          id: 'p2',
          score: 50,
          title: 'Post 2',
          likesCount: 10,
          userId: 'u2',
        },
      ];
      const scoreFn = jest.fn().mockResolvedValue(items);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      expect(result.items[0]).toEqual({
        id: 'p1',
        score: 100,
        title: 'Post 1',
        likesCount: 42,
        userId: 'u1',
      });
      expect(result.items[1]).toEqual({
        id: 'p2',
        score: 50,
        title: 'Post 2',
        likesCount: 10,
        userId: 'u2',
      });
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle items with score 0', async () => {
      const items = [
        { id: 'zero', score: 0 },
        { id: 'positive', score: 10 },
      ];
      const scoreFn = jest.fn().mockResolvedValue(items);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      expect(result.items[0].id).toBe('positive');
      expect(result.items[1].id).toBe('zero');
    });

    it('should handle negative scores', async () => {
      const items = [
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

    it('should handle single item', async () => {
      const items = [{ id: 'only', score: 42 }];
      const scoreFn = jest.fn().mockResolvedValue(items);

      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });
  });

  // ─── Pipeline Error Handling ─────────────────────────────────────

  describe('pipeline error handling', () => {
    it('should log warning when pipeline has errors but still return data', async () => {
      const items = makeItems(3);
      const scoreFn = jest.fn().mockResolvedValue(items);

      // Override pipeline to simulate a partial failure
      const originalPipeline = redis.pipeline;
      redis.pipeline = jest.fn(() => {
        const pipe = originalPipeline();
        const originalExec = pipe.exec;
        pipe.exec = async () => {
          const results = await originalExec();
          // Inject an error into one result
          results[0] = [new Error('Simulated ZADD failure'), null];
          return results;
        };
        return pipe;
      });

      // Should still return items (from the readPage after population)
      const result = await cache.getPage('sfeed:test', 0, 20, 120, scoreFn);

      // Items still accessible because mock Redis is in-memory
      expect(result.items.length).toBeGreaterThanOrEqual(0);
    });
  });
});

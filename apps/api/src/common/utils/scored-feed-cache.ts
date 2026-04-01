import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

/**
 * ScoredFeedCache — Redis-backed materialized scoring for feeds.
 *
 * Instead of re-scoring 500 items on every page request (causing content drift,
 * score drift, and duplicates across pages), this stores the scored list in a
 * Redis Sorted Set and paginates from it.
 *
 * Flow:
 * 1. First page request: acquire lock, score all candidates, store in Redis ZADD, return page 1
 * 2. Subsequent pages: read from Redis sorted set, no re-scoring
 * 3. Cache expires after TTL → next request re-scores fresh
 *
 * Concurrency safety:
 * - Uses SETNX lock to prevent concurrent cache population (race condition fix)
 * - If lock acquisition fails, retries reading from cache (another request is populating)
 *
 * Uses ZADD (sorted set) with scores as the ranking metric.
 * Pagination via ZREVRANGE (descending by score) with offset+count.
 * Members are keyed by item ID (not full JSON) to guarantee uniqueness.
 */

export interface ScoredItem {
  id: string;
  score: number;
  [key: string]: unknown;
}

export interface ScoredFeedPage {
  items: ScoredItem[];
  hasMore: boolean;
  page: number;
}

export class ScoredFeedCache {
  private readonly logger = new Logger(ScoredFeedCache.name);

  constructor(private redis: Redis) {}

  /**
   * Get or create a scored feed page.
   *
   * @param cacheKey — unique key for this user+feed combination (e.g., "sfeed:saf:foryou:{userId}")
   * @param page — 0-indexed page number
   * @param pageSize — items per page (typically 20)
   * @param ttlSeconds — cache TTL (e.g., 120 for 2 minutes)
   * @param scoreFn — async function that fetches+scores ALL candidates (only called on cache miss)
   * @returns { items: ScoredItem[], hasMore: boolean, page: number }
   */
  async getPage(
    cacheKey: string,
    page: number,
    pageSize: number,
    ttlSeconds: number,
    scoreFn: () => Promise<ScoredItem[]>,
  ): Promise<ScoredFeedPage> {
    // 1. Check if cache exists
    const cardinality = await this.redis.zcard(cacheKey);

    if (cardinality > 0) {
      // Cache hit — read fresh cardinality for accurate hasMore calculation
      // (ZCARD is O(1) so re-reading is cheap and eliminates stale totalItems)
      return this.readPage(cacheKey, page, pageSize);
    }

    // 2. Cache miss — acquire lock to prevent concurrent population
    const lockKey = `${cacheKey}:lock`;
    const lockAcquired = await this.redis.set(lockKey, '1', 'EX', 10, 'NX');

    if (!lockAcquired) {
      // Another request is populating the cache. Wait briefly then read.
      await this.sleep(50);
      const retryCard = await this.redis.zcard(cacheKey);
      if (retryCard > 0) {
        return this.readPage(cacheKey, page, pageSize);
      }
      // Still empty after wait — fall through and score ourselves
      // (the other request may have failed or produced empty results)
    }

    try {
      // 3. Score all candidates
      const scoredItems = await scoreFn();

      if (scoredItems.length === 0) {
        return { items: [], hasMore: false, page };
      }

      // 4. Populate Redis sorted set via pipeline
      // Member format: use item ID as the sorted set member for guaranteed uniqueness.
      // Store the full payload in a companion hash keyed by item ID.
      const pipeline = this.redis.pipeline();
      pipeline.del(cacheKey);
      pipeline.del(`${cacheKey}:data`);

      // ZADD: score → itemId (guarantees uniqueness by ID)
      const CHUNK_SIZE = 200;
      for (let i = 0; i < scoredItems.length; i += CHUNK_SIZE) {
        const chunk = scoredItems.slice(i, i + CHUNK_SIZE);
        const zaddArgs: (string | number)[] = [];
        const hsetArgs: string[] = [];
        for (const item of chunk) {
          zaddArgs.push(item.score, item.id);
          hsetArgs.push(item.id, JSON.stringify(item));
        }
        pipeline.zadd(cacheKey, ...zaddArgs);
        if (hsetArgs.length > 0) {
          pipeline.hset(`${cacheKey}:data`, ...hsetArgs);
        }
      }

      pipeline.expire(cacheKey, ttlSeconds);
      pipeline.expire(`${cacheKey}:data`, ttlSeconds);

      const results = await pipeline.exec();

      // 5. Check pipeline results for errors
      if (results) {
        const errors = results.filter(([err]) => err !== null);
        if (errors.length > 0) {
          this.logger.warn(
            `ScoredFeedCache pipeline had ${errors.length} error(s) for key ${cacheKey}`,
          );
        }
      }

      // 6. Paginate from the just-built set
      return this.readPage(cacheKey, page, pageSize);
    } finally {
      // Release lock (best-effort — TTL is the safety net)
      await this.redis.del(lockKey).catch((e) => this.logger.debug('Feed cache lock release failed', e?.message));
    }
  }

  /**
   * Invalidate a feed cache (e.g., when user publishes a post).
   * Removes both the sorted set and the companion data hash.
   */
  async invalidate(cacheKey: string): Promise<void> {
    await this.redis.del(cacheKey, `${cacheKey}:data`);
  }

  /**
   * Read a page from an existing sorted set.
   * Re-reads ZCARD for accurate hasMore (not stale from initial check).
   */
  private async readPage(
    cacheKey: string,
    page: number,
    pageSize: number,
  ): Promise<ScoredFeedPage> {
    const start = page * pageSize;
    const stop = start + pageSize - 1;

    // ZREVRANGE returns member IDs in descending score order
    // Re-read ZCARD for accurate totalItems (prevents stale hasMore)
    const [memberIds, totalItems] = await Promise.all([
      this.redis.zrevrange(cacheKey, start, stop),
      this.redis.zcard(cacheKey),
    ]);

    if (memberIds.length === 0) {
      return { items: [], hasMore: totalItems > (page + 1) * pageSize, page };
    }

    // Fetch full payloads from companion hash
    const payloads = await this.redis.hmget(`${cacheKey}:data`, ...memberIds);

    const items: ScoredItem[] = [];
    for (const payload of payloads) {
      if (!payload) continue;
      try {
        items.push(JSON.parse(payload) as ScoredItem);
      } catch {
        // Skip corrupted entries
      }
    }

    const hasMore = totalItems > (page + 1) * pageSize;

    return { items, hasMore, page };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

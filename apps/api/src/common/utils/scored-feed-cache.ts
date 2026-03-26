import Redis from 'ioredis';

/**
 * ScoredFeedCache — Redis-backed materialized scoring for feeds.
 *
 * Instead of re-scoring 500 items on every page request (causing content drift,
 * score drift, and duplicates across pages), this stores the scored list in a
 * Redis Sorted Set and paginates from it.
 *
 * Flow:
 * 1. First page request: score all candidates, store in Redis ZADD, return page 1
 * 2. Subsequent pages: read from Redis sorted set, no re-scoring
 * 3. Cache expires after TTL → next request re-scores fresh
 *
 * Uses ZADD (sorted set) with scores as the ranking metric.
 * Pagination via ZREVRANGE (descending by score) with offset+count.
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

    if (!cardinality || cardinality === 0) {
      // Cache miss — score all candidates and populate the sorted set
      const scoredItems = await scoreFn();

      if (scoredItems.length === 0) {
        return { items: [], hasMore: false, page };
      }

      // Build ZADD args: score1 member1 score2 member2 ...
      // Store each item as JSON in the member field, score as the ZADD score.
      // To guarantee uniqueness even if IDs somehow repeat with different data,
      // the member is the full JSON payload keyed by id.
      const pipeline = this.redis.pipeline();
      pipeline.del(cacheKey);

      // ZADD in chunks to avoid huge single command (ioredis handles this well,
      // but chunking is defensive for very large sets)
      const CHUNK_SIZE = 200;
      for (let i = 0; i < scoredItems.length; i += CHUNK_SIZE) {
        const chunk = scoredItems.slice(i, i + CHUNK_SIZE);
        const args: (string | number)[] = [];
        for (const item of chunk) {
          args.push(item.score, JSON.stringify(item));
        }
        pipeline.zadd(cacheKey, ...args);
      }

      pipeline.expire(cacheKey, ttlSeconds);
      await pipeline.exec();

      // Now paginate from the just-built set
      return this.readPage(cacheKey, page, pageSize, scoredItems.length);
    }

    // 2. Cache hit — paginate directly from the sorted set
    return this.readPage(cacheKey, page, pageSize, cardinality);
  }

  /**
   * Invalidate a feed cache (e.g., when user publishes a post).
   */
  async invalidate(cacheKey: string): Promise<void> {
    await this.redis.del(cacheKey);
  }

  /**
   * Read a page from an existing sorted set.
   */
  private async readPage(
    cacheKey: string,
    page: number,
    pageSize: number,
    totalItems: number,
  ): Promise<ScoredFeedPage> {
    const start = page * pageSize;
    const stop = start + pageSize - 1;

    // ZREVRANGE returns members in descending score order
    const members = await this.redis.zrevrange(cacheKey, start, stop);

    const items: ScoredItem[] = [];
    for (const member of members) {
      try {
        items.push(JSON.parse(member) as ScoredItem);
      } catch {
        // Skip corrupted members
      }
    }

    const hasMore = totalItems > (page + 1) * pageSize;

    return { items, hasMore, page };
  }
}

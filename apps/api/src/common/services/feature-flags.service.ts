import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Simple Redis-backed feature flags.
 *
 * Flags are stored as Redis hash: feature_flags → { flagName: "true"|"false"|percentage }
 *
 * Usage:
 *   if (await this.flags.isEnabled('new_feed_algorithm')) { ... }
 *   if (await this.flags.isEnabledForUser('dark_mode_v2', userId)) { ... }
 *
 * Set flags via Redis CLI or admin endpoint:
 *   HSET feature_flags new_feed_algorithm true
 *   HSET feature_flags experimental_ui 25       (25% rollout)
 *   HSET feature_flags maintenance_mode false
 */
@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private readonly HASH_KEY = 'feature_flags';
  private localCache: Map<string, string> | null = null;
  private lastCacheTime = 0;
  private readonly CACHE_TTL_MS = 30_000; // Refresh local cache every 30s

  constructor(@Inject('REDIS') private redis: Redis) {}

  /**
   * Check if a flag is globally enabled.
   * Returns true for "true" or percentage > 0.
   */
  async isEnabled(flagName: string): Promise<boolean> {
    const value = await this.getFlagValue(flagName);
    if (!value) return false;
    if (value === 'true') return true;
    if (value === 'false') return false;
    // Numeric = percentage rollout, treat as enabled if > 0
    const pct = parseInt(value, 10);
    return !isNaN(pct) && pct > 0;
  }

  /**
   * Check if a flag is enabled for a specific user.
   * Supports percentage rollout: consistent hash of userId determines inclusion.
   */
  async isEnabledForUser(flagName: string, userId: string): Promise<boolean> {
    const value = await this.getFlagValue(flagName);
    if (!value) return false;
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Percentage rollout: hash userId to 0-99, compare against threshold
    const pct = parseInt(value, 10);
    if (isNaN(pct)) return false;
    const hash = simpleHash(userId + ':' + flagName) % 100;
    return hash < pct;
  }

  /** Get all current flags (for admin dashboard or client config) */
  async getAllFlags(): Promise<Record<string, string>> {
    return this.redis.hgetall(this.HASH_KEY);
  }

  /** Set a flag value */
  async setFlag(flagName: string, value: string): Promise<void> {
    await this.redis.hset(this.HASH_KEY, flagName, value);
    this.localCache = null; // Invalidate local cache
  }

  /** Delete a flag */
  async deleteFlag(flagName: string): Promise<void> {
    await this.redis.hdel(this.HASH_KEY, flagName);
    this.localCache = null;
  }

  private async getFlagValue(flagName: string): Promise<string | null> {
    // Use local cache to avoid Redis round-trip on every check
    const now = Date.now();
    if (this.localCache && now - this.lastCacheTime < this.CACHE_TTL_MS) {
      return this.localCache.get(flagName) ?? null;
    }

    try {
      const all = await this.redis.hgetall(this.HASH_KEY);
      this.localCache = new Map(Object.entries(all));
      this.lastCacheTime = now;
      return this.localCache.get(flagName) ?? null;
    } catch (err) {
      this.logger.error('Failed to fetch feature flags from Redis', err);
      // Fall back to local cache if available
      return this.localCache?.get(flagName) ?? null;
    }
  }
}

/** Simple deterministic hash for percentage rollout */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

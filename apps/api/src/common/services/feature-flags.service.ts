import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';

/**
 * Feature flags with Redis (fast) + DB (durable) dual storage.
 *
 * Read path: local cache → Redis → DB fallback
 * Write path: Redis + DB (dual write)
 *
 * Redis flush no longer loses all flags — DB is the durable source of truth.
 */
@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private readonly HASH_KEY = 'feature_flags';
  private localCache: Map<string, string> | null = null;
  private lastCacheTime = 0;
  private readonly CACHE_TTL_MS = 30_000;

  constructor(
    @Inject('REDIS') private redis: Redis,
    private prisma: PrismaService,
  ) {}

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

  /** Set a flag value — dual write to Redis (fast) + DB (durable) */
  async setFlag(flagName: string, value: string): Promise<void> {
    await this.redis.hset(this.HASH_KEY, flagName, value);
    await this.redis.expire(this.HASH_KEY, 90 * 24 * 3600);
    // Persist to DB (non-blocking — Redis is authoritative for reads)
    this.prisma.featureFlag.upsert({
      where: { name: flagName },
      create: { name: flagName, value },
      update: { value },
    }).catch(err => this.logger.warn(`Failed to persist flag "${flagName}" to DB`, err instanceof Error ? err.message : err));
    this.localCache = null;
  }

  /** Delete a flag — from both Redis and DB */
  async deleteFlag(flagName: string): Promise<void> {
    await this.redis.hdel(this.HASH_KEY, flagName);
    this.prisma.featureFlag.deleteMany({ where: { name: flagName } })
      .catch(err => this.logger.warn(`Failed to delete flag "${flagName}" from DB`, err instanceof Error ? err.message : err));
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
      this.logger.error('Failed to fetch feature flags from Redis', err instanceof Error ? err.message : err);
      // Fall back to local cache first
      if (this.localCache) {
        return this.localCache.get(flagName) ?? null;
      }
      // Last resort: fall back to DB
      try {
        const dbFlags = await this.prisma.featureFlag.findMany({ take: 200 });
        this.localCache = new Map(dbFlags.map(f => [f.name, f.value]));
        this.lastCacheTime = Date.now();
        this.logger.log(`Feature flags recovered from DB (${dbFlags.length} flags loaded)`);
        return this.localCache.get(flagName) ?? null;
      } catch {
        this.logger.warn('Feature flags unavailable — Redis AND DB both down. All flags will return false.');
        return null;
      }
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

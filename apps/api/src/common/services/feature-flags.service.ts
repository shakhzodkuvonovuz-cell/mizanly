import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';

/** Supported feature flag value types */
export type FeatureFlagType = 'boolean' | 'percentage' | 'string' | 'json';

/** Parsed feature flag value with its inferred type */
export interface TypedFlagValue {
  raw: string;
  type: FeatureFlagType;
  booleanValue?: boolean;
  numberValue?: number;
  jsonValue?: unknown;
}

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

  /** Set a flag value — dual write to Redis (fast) + DB (durable).
   *  DB write is AWAITED to prevent data loss during outages.
   *  Validates the value format before persisting. */
  async setFlag(flagName: string, value: string): Promise<void> {
    // Validate flag name: 1-50 chars, alphanumeric + underscores/hyphens
    if (!flagName || flagName.length > 50 || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(flagName)) {
      throw new BadRequestException('Flag name must be 1-50 characters, starting with a letter, containing only letters, digits, underscores, and hyphens');
    }

    // Validate flag value: must be a recognized type
    FeatureFlagsService.validateFlagValue(value);

    await this.redis.hset(this.HASH_KEY, flagName, value);
    await this.redis.expire(this.HASH_KEY, 90 * 24 * 3600);
    // Await DB write — if DB is down, flag is still in Redis but we log the failure
    try {
      await this.prisma.featureFlag.upsert({
        where: { name: flagName },
        create: { name: flagName, value },
        update: { value },
      });
    } catch (err) {
      this.logger.error(`DURABLE WRITE FAILED for flag "${flagName}" — flag is in Redis but NOT in DB. Manual reconciliation needed.`, err instanceof Error ? err.message : err);
    }
    this.localCache = null;
  }

  /**
   * Validate that a flag value conforms to one of the accepted types:
   * - boolean: "true" or "false"
   * - percentage: integer 0-100
   * - json: valid JSON object or array (max 1KB)
   * - string: non-empty string (max 200 chars, no control characters)
   */
  static validateFlagValue(value: string): void {
    if (value === undefined || value === null || value === '') {
      throw new BadRequestException('Flag value must not be empty');
    }

    // Boolean — always valid
    if (value === 'true' || value === 'false') return;

    // Percentage rollout — integer 0-100
    if (/^[0-9]{1,3}$/.test(value)) {
      const num = parseInt(value, 10);
      if (num >= 0 && num <= 100) return;
      throw new BadRequestException(`Percentage value must be 0-100, got ${num}`);
    }

    // JSON — valid object/array (max 1KB to prevent abuse)
    if (value.startsWith('{') || value.startsWith('[')) {
      if (value.length > 1024) {
        throw new BadRequestException('JSON flag value must be 1024 characters or less');
      }
      try {
        JSON.parse(value);
        return;
      } catch {
        throw new BadRequestException('Invalid JSON in flag value');
      }
    }

    // String — max 200 chars, no control characters
    if (value.length > 200) {
      throw new BadRequestException('String flag value must be 200 characters or less');
    }
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(value)) {
      throw new BadRequestException('Flag value must not contain control characters');
    }
  }

  /**
   * Parse a raw flag value into a typed representation.
   * Useful for callers who need to know the type of a flag's value.
   */
  static parseFlagValue(raw: string | null): TypedFlagValue | null {
    if (raw === null || raw === undefined) return null;

    if (raw === 'true' || raw === 'false') {
      return { raw, type: 'boolean', booleanValue: raw === 'true' };
    }

    const numMatch = /^[0-9]{1,3}$/.test(raw);
    if (numMatch) {
      const num = parseInt(raw, 10);
      if (num >= 0 && num <= 100) {
        return { raw, type: 'percentage', numberValue: num };
      }
    }

    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        return { raw, type: 'json', jsonValue: parsed };
      } catch {
        // Not valid JSON, treat as string
      }
    }

    return { raw, type: 'string' };
  }

  /** Delete a flag — from both Redis and DB */
  async deleteFlag(flagName: string): Promise<void> {
    await this.redis.hdel(this.HASH_KEY, flagName);
    try {
      await this.prisma.featureFlag.deleteMany({ where: { name: flagName } });
    } catch (err) {
      this.logger.error(`DURABLE DELETE FAILED for flag "${flagName}"`, err instanceof Error ? err.message : err);
    }
    this.localCache = null;
  }

  /** Get all current flags — falls back to DB if Redis is empty/down */
  async getAllFlags(): Promise<Record<string, string>> {
    try {
      const redisFlags = await this.redis.hgetall(this.HASH_KEY);
      if (Object.keys(redisFlags).length > 0) return redisFlags;
    } catch {
      // Redis down — fall through to DB
    }
    // DB fallback
    try {
      const dbFlags = await this.prisma.featureFlag.findMany({ take: 200 });
      const result: Record<string, string> = {};
      for (const f of dbFlags) result[f.name] = f.value;
      return result;
    } catch {
      return {};
    }
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

import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Lightweight analytics event tracking.
 *
 * Events are buffered in Redis lists and can be consumed by:
 * - A worker that flushes to PostgreSQL analytics tables
 * - An external pipeline (PostHog, Mixpanel, BigQuery)
 * - A Redis consumer (BRPOP pattern)
 *
 * Event structure: { event, userId?, properties, timestamp }
 */

export interface AnalyticsEvent {
  event: string;
  userId?: string;
  properties?: Record<string, string | number | boolean | null>;
  timestamp: string;
}

@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly EVENTS_KEY = 'analytics:events';
  private readonly COUNTERS_PREFIX = 'analytics:counter:';
  private readonly MAX_BUFFER_SIZE = 10_000; // Cap to prevent unbounded memory growth if Redis is unavailable
  private buffer: AnalyticsEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject('REDIS') private redis: Redis) {
    // Flush buffer every 10 seconds
    this.flushTimer = setInterval(() => this.flush(), 10_000);
  }

  /**
   * Track an analytics event (buffered, non-blocking).
   */
  track(event: string, userId?: string, properties?: Record<string, string | number | boolean | null>): void {
    // Drop oldest events if buffer exceeds cap (prevents OOM if Redis is down)
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      this.buffer.splice(0, this.buffer.length - this.MAX_BUFFER_SIZE + 1);
    }

    this.buffer.push({
      event,
      userId,
      properties,
      timestamp: new Date().toISOString(),
    });

    // Auto-flush if buffer gets large
    if (this.buffer.length >= 100) {
      this.flush();
    }
  }

  /**
   * Increment a named counter (for real-time metrics).
   * Counters auto-expire after 24 hours.
   */
  async increment(counterName: string, amount = 1): Promise<void> {
    const key = `${this.COUNTERS_PREFIX}${counterName}`;
    const pipeline = this.redis.pipeline();
    pipeline.incrby(key, amount);
    pipeline.expire(key, 86400); // 24-hour TTL
    await pipeline.exec();
  }

  /**
   * Get a counter value.
   */
  async getCounter(counterName: string): Promise<number> {
    const val = await this.redis.get(`${this.COUNTERS_PREFIX}${counterName}`);
    return val ? parseInt(val, 10) : 0;
  }

  /**
   * Get multiple counters at once.
   */
  async getCounters(names: string[]): Promise<Record<string, number>> {
    if (names.length === 0) return {};
    const keys = names.map(n => `${this.COUNTERS_PREFIX}${n}`);
    const values = await this.redis.mget(...keys);
    const result: Record<string, number> = {};
    names.forEach((name, i) => {
      result[name] = values[i] ? parseInt(values[i]!, 10) : 0;
    });
    return result;
  }

  /**
   * Flush buffered events to Redis list.
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const events = this.buffer.splice(0);
    try {
      const pipeline = this.redis.pipeline();
      for (const event of events) {
        pipeline.lpush(this.EVENTS_KEY, JSON.stringify(event));
      }
      // Keep only last 100K events in Redis (older ones should be consumed by worker)
      pipeline.ltrim(this.EVENTS_KEY, 0, 99_999);
      // J07-C3: Set 7-day TTL on analytics events list to prevent unbounded Redis memory
      pipeline.expire(this.EVENTS_KEY, 7 * 86400);
      await pipeline.exec();
    } catch (err) {
      this.logger.error(`Failed to flush ${events.length} analytics events`, err);
      // Put events back in buffer for retry
      this.buffer.unshift(...events);
    }
  }

  /** Clean up on app shutdown */
  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush(); // Final flush
  }
}

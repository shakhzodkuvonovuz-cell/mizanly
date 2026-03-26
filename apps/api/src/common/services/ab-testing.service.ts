import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Finding #47: A/B Testing Framework
 *
 * Simple Redis-backed A/B testing service. Supports:
 * - Creating experiments with named variants
 * - Deterministic user assignment (consistent across sessions)
 * - Redis-stored experiment config (hot-reloadable without deploy)
 * - Variant weight distribution
 *
 * Usage:
 *   const variant = await abTesting.getVariant('feed_ranking_v2', userId);
 *   if (variant === 'control') { ... } else if (variant === 'treatment') { ... }
 */

export interface Experiment {
  id: string;
  name: string;
  variants: Array<{ name: string; weight: number }>;
  enabled: boolean;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class ABTestingService {
  private readonly logger = new Logger(ABTestingService.name);
  private readonly EXPERIMENT_KEY_PREFIX = 'ab:experiment:';
  private readonly ASSIGNMENT_KEY_PREFIX = 'ab:assignment:';

  constructor(@Inject('REDIS') private redis: Redis) {}

  /** SCAN-based key collection (non-blocking alternative to KEYS) */
  private async scanKeys(pattern: string): Promise<string[]> {
    const allKeys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      allKeys.push(...keys);
    } while (cursor !== '0');
    return allKeys;
  }

  /**
   * Create or update an experiment definition.
   * Stored in Redis for hot-reload without deployments.
   */
  async createExperiment(experiment: Experiment): Promise<Experiment> {
    const key = `${this.EXPERIMENT_KEY_PREFIX}${experiment.id}`;
    await this.redis.set(key, JSON.stringify(experiment));
    this.logger.log(`Experiment created/updated: ${experiment.id}`);
    return experiment;
  }

  /**
   * Get all experiments.
   */
  async getExperiments(): Promise<Experiment[]> {
    const keys = await this.scanKeys(`${this.EXPERIMENT_KEY_PREFIX}*`);
    if (keys.length === 0) return [];

    const values = await this.redis.mget(...keys);
    return values
      .filter((v): v is string => v !== null)
      .map(v => JSON.parse(v) as Experiment);
  }

  /**
   * Get a specific experiment by ID.
   */
  async getExperiment(experimentId: string): Promise<Experiment | null> {
    const raw = await this.redis.get(`${this.EXPERIMENT_KEY_PREFIX}${experimentId}`);
    return raw ? JSON.parse(raw) : null;
  }

  /**
   * Get the variant assigned to a user for a given experiment.
   * Assignment is deterministic — same user always gets same variant.
   * Uses hash-based assignment for consistent distribution.
   */
  async getVariant(experimentId: string, userId: string): Promise<string> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment || !experiment.enabled) return 'control';
    if (experiment.variants.length === 0) return 'control';

    // Check for existing assignment
    const assignmentKey = `${this.ASSIGNMENT_KEY_PREFIX}${experimentId}:${userId}`;
    const existing = await this.redis.get(assignmentKey);
    if (existing) return existing;

    // Deterministic assignment based on hash of (experimentId + userId)
    const hash = this.simpleHash(`${experimentId}:${userId}`);
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    const bucket = hash % totalWeight;

    let cumulative = 0;
    let assigned = experiment.variants[0].name;
    for (const variant of experiment.variants) {
      cumulative += variant.weight;
      if (bucket < cumulative) {
        assigned = variant.name;
        break;
      }
    }

    // Store assignment (TTL 90 days)
    await this.redis.set(assignmentKey, assigned, 'EX', 90 * 24 * 60 * 60);

    return assigned;
  }

  /**
   * Get all variant assignments for a user across all experiments.
   */
  async getUserAssignments(userId: string): Promise<Record<string, string>> {
    const experiments = await this.getExperiments();
    const assignments: Record<string, string> = {};

    for (const exp of experiments) {
      if (exp.enabled) {
        assignments[exp.id] = await this.getVariant(exp.id, userId);
      }
    }

    return assignments;
  }

  /**
   * Track a conversion event for an experiment variant.
   * Uses Redis sorted set for aggregation.
   */
  async trackConversion(experimentId: string, userId: string, eventName: string): Promise<void> {
    const variant = await this.getVariant(experimentId, userId);
    const key = `ab:conversions:${experimentId}:${variant}:${eventName}`;
    await this.redis.incr(key);
  }

  /**
   * Get conversion metrics for an experiment.
   */
  async getMetrics(experimentId: string): Promise<Record<string, Record<string, number>>> {
    const experiment = await this.getExperiment(experimentId);
    if (!experiment) return {};

    const metrics: Record<string, Record<string, number>> = {};
    for (const variant of experiment.variants) {
      const conversionKeys = await this.scanKeys(`ab:conversions:${experimentId}:${variant.name}:*`);
      metrics[variant.name] = {};
      for (const key of conversionKeys) {
        const eventName = key.split(':').pop() || '';
        const count = await this.redis.get(key);
        metrics[variant.name][eventName] = parseInt(count || '0', 10);
      }
    }

    return metrics;
  }

  /**
   * Delete an experiment and all its assignments.
   */
  async deleteExperiment(experimentId: string): Promise<void> {
    await this.redis.del(`${this.EXPERIMENT_KEY_PREFIX}${experimentId}`);
    const assignmentKeys = await this.scanKeys(`${this.ASSIGNMENT_KEY_PREFIX}${experimentId}:*`);
    if (assignmentKeys.length > 0) {
      await this.redis.del(...assignmentKeys);
    }
    const conversionKeys = await this.scanKeys(`ab:conversions:${experimentId}:*`);
    if (conversionKeys.length > 0) {
      await this.redis.del(...conversionKeys);
    }
  }

  /** Simple deterministic hash for variant assignment */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

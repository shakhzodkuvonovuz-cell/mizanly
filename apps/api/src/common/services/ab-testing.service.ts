import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../../config/prisma.service';

/**
 * Finding #47: A/B Testing Framework
 *
 * Redis-backed A/B testing service with DB durability.
 * Redis is primary (fast reads), DB is backup (survives Redis flushes).
 * On startup, loads experiments from DB into Redis if Redis is empty.
 *
 * Usage:
 *   const variant = await abTesting.getVariant('feed_ranking_v2', userId);
 *   if (variant === 'control') { ... } else if (variant === 'treatment') { ... }
 */

export interface ExperimentConfig {
  id: string;
  name: string;
  variants: Array<{ name: string; weight: number }>;
  enabled: boolean;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class ABTestingService implements OnModuleInit {
  private readonly logger = new Logger(ABTestingService.name);
  private readonly EXPERIMENT_KEY_PREFIX = 'ab:experiment:';
  private readonly ASSIGNMENT_KEY_PREFIX = 'ab:assignment:';

  constructor(
    @Inject('REDIS') private redis: Redis,
    private prisma: PrismaService,
  ) {}

  /**
   * On startup, hydrate Redis from DB if any experiments exist in DB but not in Redis.
   * This ensures experiments survive Redis restarts.
   */
  async onModuleInit() {
    try {
      const dbExperiments = await this.prisma.experiment.findMany();
      if (dbExperiments.length === 0) return;

      for (const exp of dbExperiments) {
        const key = `${this.EXPERIMENT_KEY_PREFIX}${exp.id}`;
        const existing = await this.redis.get(key);
        if (!existing) {
          const config: ExperimentConfig = {
            id: exp.id,
            name: exp.name,
            variants: exp.variants as Array<{ name: string; weight: number }>,
            enabled: exp.enabled,
            startDate: exp.startDate?.toISOString(),
            endDate: exp.endDate?.toISOString(),
          };
          await this.redis.set(key, JSON.stringify(config), 'EX', 30 * 24 * 3600); // 30 day TTL
        }
      }
      this.logger.log(`Hydrated ${dbExperiments.length} experiment(s) from DB into Redis`);
    } catch (error) {
      this.logger.warn('Failed to hydrate experiments from DB — Redis will be authoritative', error instanceof Error ? error.message : error);
    }
  }

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
   * Stored in Redis for hot-reload, mirrored to DB for durability.
   */
  async createExperiment(experiment: ExperimentConfig): Promise<ExperimentConfig> {
    const key = `${this.EXPERIMENT_KEY_PREFIX}${experiment.id}`;
    await this.redis.set(key, JSON.stringify(experiment), 'EX', 90 * 24 * 3600); // 90 day TTL

    // Mirror to DB for durability (non-blocking — Redis is authoritative)
    this.prisma.experiment.upsert({
      where: { id: experiment.id },
      update: {
        name: experiment.name,
        variants: experiment.variants as any,
        enabled: experiment.enabled,
        startDate: experiment.startDate ? new Date(experiment.startDate) : null,
        endDate: experiment.endDate ? new Date(experiment.endDate) : null,
      },
      create: {
        id: experiment.id,
        name: experiment.name,
        variants: experiment.variants as any,
        enabled: experiment.enabled,
        startDate: experiment.startDate ? new Date(experiment.startDate) : null,
        endDate: experiment.endDate ? new Date(experiment.endDate) : null,
      },
    }).catch(err => this.logger.warn(`Failed to mirror experiment ${experiment.id} to DB`, err instanceof Error ? err.message : err));

    this.logger.log(`Experiment created/updated: ${experiment.id}`);
    return experiment;
  }

  /**
   * Get all experiments. Falls back to DB if Redis is empty.
   */
  async getExperiments(): Promise<ExperimentConfig[]> {
    const keys = await this.scanKeys(`${this.EXPERIMENT_KEY_PREFIX}*`);
    if (keys.length > 0) {
      const values = await this.redis.mget(...keys);
      return values
        .filter((v): v is string => v !== null)
        .map(v => JSON.parse(v) as ExperimentConfig);
    }

    // DB fallback: Redis may have been flushed
    try {
      const dbExperiments = await this.prisma.experiment.findMany();
      return dbExperiments.map(exp => ({
        id: exp.id,
        name: exp.name,
        variants: exp.variants as Array<{ name: string; weight: number }>,
        enabled: exp.enabled,
        startDate: exp.startDate?.toISOString(),
        endDate: exp.endDate?.toISOString(),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get a specific experiment by ID. Falls back to DB if not in Redis.
   */
  async getExperiment(experimentId: string): Promise<ExperimentConfig | null> {
    const raw = await this.redis.get(`${this.EXPERIMENT_KEY_PREFIX}${experimentId}`);
    if (raw) return JSON.parse(raw);

    // DB fallback
    try {
      const exp = await this.prisma.experiment.findUnique({ where: { id: experimentId } });
      if (!exp) return null;
      const config: ExperimentConfig = {
        id: exp.id,
        name: exp.name,
        variants: exp.variants as Array<{ name: string; weight: number }>,
        enabled: exp.enabled,
        startDate: exp.startDate?.toISOString(),
        endDate: exp.endDate?.toISOString(),
      };
      // Re-populate Redis with TTL
      await this.redis.set(`${this.EXPERIMENT_KEY_PREFIX}${experimentId}`, JSON.stringify(config), 'EX', 90 * 24 * 3600);
      return config;
    } catch {
      return null;
    }
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

    // Remove from DB
    this.prisma.experiment.delete({ where: { id: experimentId } })
      .catch(() => {}); // May not exist in DB — that's fine
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

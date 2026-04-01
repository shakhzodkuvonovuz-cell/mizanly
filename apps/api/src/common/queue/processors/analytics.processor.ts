import * as Sentry from "@sentry/node";
import { Injectable, Logger, OnModuleInit, OnModuleDestroy, forwardRef, Inject } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { GamificationService } from '../../../modules/gamification/gamification.service';
import { QueueService } from '../queue.service';
import { attachCorrelationId } from '../with-correlation';

interface GamificationJobData {
  type: 'award-xp' | 'update-streak';
  userId: string;
  action: string;
}

interface EngagementJobData {
  type: 'view' | 'like' | 'comment' | 'share';
  userId: string;
  contentType: string;
  contentId: string;
}

/**
 * Analytics processor — handles gamification XP/streak updates and engagement tracking.
 *
 * These jobs are fire-and-forget from the caller's perspective but are
 * reliably processed via the queue with retry on failure.
 */
@Injectable()
export class AnalyticsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private config: ConfigService,
    private gamification: GamificationService,
    @Inject(forwardRef(() => QueueService)) private queueService: QueueService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set — analytics worker disabled');
      return;
    }

    this.worker = new Worker(
      'analytics',
      async (job: Job) => {
        attachCorrelationId(job, this.logger);
        switch (job.name) {
          case 'award-xp':
            await this.processAwardXP(job as Job<GamificationJobData>);
            break;
          case 'update-streak':
            await this.processUpdateStreak(job as Job<GamificationJobData>);
            break;
          case 'track-engagement':
            await this.processEngagementTracking(job as Job<EngagementJobData>);
            break;
          default:
            throw new Error(`Unknown analytics job type: ${job.name}`);
        }
      },
      {
        connection: { url: redisUrl },
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.debug(`Analytics job ${job.id} completed`);
      const duration = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
      if (duration > 5000) this.logger.warn(`Job ${job.id} (${job.name}) took ${duration}ms`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(`Analytics job ${job?.id} failed: ${err.message}`);
      Sentry.captureException(err, { tags: { queue: job?.queueName, jobId: job?.id } });
      this.queueService.moveToDlq(job, err, 'analytics').catch(() => {});
    });
    this.logger.log('Analytics worker started');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private async processAwardXP(job: Job<GamificationJobData>): Promise<void> {
    const { userId, action } = job.data;
    await this.gamification.awardXP(userId, action);
    this.logger.debug(`Awarded XP to ${userId} for ${action}`);
  }

  private async processUpdateStreak(job: Job<GamificationJobData>): Promise<void> {
    const { userId, action } = job.data;
    await this.gamification.updateStreak(userId, action);
    this.logger.debug(`Updated streak for ${userId} (${action})`);
  }

  private async processEngagementTracking(job: Job<EngagementJobData>): Promise<void> {
    const { type, userId, contentType, contentId } = job.data;
    this.logger.debug(`Tracked engagement: ${type} by ${userId} on ${contentType}/${contentId}`);
    // Real-time engagement tracking is handled by AnalyticsService (analytics.service.ts)
    // which writes to Redis pipelines for instant counters (views, likes, shares).
    // FeedService.logInteraction() also records per-user engagement in the FeedInteraction table.
    // This queue processor exists for durable batch analytics (e.g., daily aggregation,
    // cohort analysis) but has no separate storage target yet. When a data warehouse or
    // analytics DB is added, this processor should write engagement events there.
  }
}

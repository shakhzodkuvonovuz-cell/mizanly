import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { GamificationService } from '../../../modules/gamification/gamification.service';

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
            this.logger.warn(`Unknown analytics job type: ${job.name}`);
        }
      },
      {
        connection: { url: redisUrl },
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.debug(`Analytics job ${job.id} completed`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(`Analytics job ${job?.id} failed: ${err.message}`);
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
    // Engagement tracking is handled by the AnalyticsService in real-time.
    // This queue entry provides durable recording for delayed/batch analytics.
  }
}

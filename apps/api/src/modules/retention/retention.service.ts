import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';

/**
 * Retention & Engagement service — session depth tracking.
 * Dead methods removed (checkReelViewMilestone, getUsersWithExpiringStreaks,
 * getSocialFomoTargets, canSendNotification, trackNotificationSent, getWeeklySummary,
 * isInJummahGracePeriod, formatViewCount) — all had zero external callers.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  /**
   * Record session depth metrics (scroll depth, time, interactions).
   * Stored in Redis for real-time analytics.
   */
  async trackSessionDepth(
    userId: string,
    data: {
      scrollDepth: number;
      timeSpentMs: number;
      interactionCount: number;
      space: string;
    },
  ): Promise<void> {
    const key = `session:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const sessionData = JSON.stringify({
      ...data,
      timestamp: Date.now(),
    });

    await this.redis.lpush(key, sessionData);
    await this.redis.expire(key, 86400 * 7); // Keep 7 days
  }
}

import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';

/**
 * Retention & Engagement service — handles push notification triggers
 * for milestone events, streak maintenance, social FOMO, and digests.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  // ── 76.1: "Your reel got X views!" ─────────────────────────

  /**
   * Check if a reel has crossed a view milestone and trigger notification.
   * Milestones: 100, 1K, 10K, 100K, 1M
   */
  async checkReelViewMilestone(reelId: string): Promise<string | null> {
    const reel = await this.prisma.reel.findUnique({
      where: { id: reelId },
      select: { userId: true, viewsCount: true },
    });
    if (!reel) return null;

    const milestones = [100, 1000, 10000, 100000, 1000000];
    const currentViews = reel.viewsCount;

    for (const milestone of milestones) {
      if (currentViews >= milestone) {
        const key = `milestone:reel:${reelId}:${milestone}`;
        const alreadySent = await this.redis.get(key);
        if (!alreadySent) {
          await this.redis.setex(key, 86400 * 30, '1'); // 30 day TTL
          return this.formatViewCount(milestone);
        }
      }
    }

    return null;
  }

  // ── 76.2: Streak expiration warning ─────────────────────────

  /**
   * Find users whose streaks expire within the next 2 hours.
   * Returns user IDs that need a "Don't lose your streak!" push.
   */
  async getUsersWithExpiringStreaks(): Promise<Array<{ userId: string; currentStreak: number }>> {
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const now = new Date();

    // Find streaks where the user hasn't done their daily action today
    const activeStreaks = await this.prisma.streak.findMany({
      where: {
        currentStreak: { gte: 3 }, // Only warn for streaks of 3+ days
        lastActivityAt: {
          // Last activity was yesterday (not today) — streak is at risk
          lt: new Date(new Date().setHours(0, 0, 0, 0)),
          gte: new Date(Date.now() - 48 * 60 * 60 * 1000), // Within last 48h (still valid)
        },
      },
      select: { userId: true, currentStreak: true },
      take: 50,
    });

    // Filter out users we've already warned today
    const results: Array<{ userId: string; currentStreak: number }> = [];
    for (const streak of activeStreaks) {
      const key = `streak_warn:${streak.userId}:${new Date().toISOString().slice(0, 10)}`;
      const alreadyWarned = await this.redis.get(key);
      if (!alreadyWarned) {
        await this.redis.setex(key, 86400, '1');
        results.push(streak);
      }
    }

    return results;
  }

  // ── 76.3: Social FOMO notification ──────────────────────────

  /**
   * Find users who haven't been active in 24h+ and have friends who posted.
   */
  async getSocialFomoTargets(): Promise<Array<{ userId: string; friendCount: number }>> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find users inactive for 24h+
    const inactiveUsers = await this.prisma.user.findMany({
      where: {
        isDeactivated: false,
        lastActiveAt: { lt: oneDayAgo },
        // Must have been active at some point in the last week
        lastActiveAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
      take: 50,
    });

    const results: Array<{ userId: string; friendCount: number }> = [];

    for (const user of inactiveUsers) {
      // Check if we already sent FOMO notification today
      const key = `fomo:${user.id}:${new Date().toISOString().slice(0, 10)}`;
      const alreadySent = await this.redis.get(key);
      if (alreadySent) continue;

      // Count friends who posted since user went inactive
      const friendPosts = await this.prisma.post.count({
        where: {
          createdAt: { gte: oneDayAgo },
          user: {
            followers: { some: { followerId: user.id } },
          },
        },
      });

      if (friendPosts >= 3) {
        await this.redis.setex(key, 86400, '1');
        results.push({ userId: user.id, friendCount: friendPosts });
      }
    }

    return results;
  }

  // ── 76.6: Streak-break grace period ─────────────────────────

  /**
   * Check if current time is within Friday prayer grace window.
   * Streaks should not break during Jummah prayer time.
   */
  isInJummahGracePeriod(): boolean {
    const now = new Date();
    if (now.getDay() !== 5) return false; // Not Friday
    const hour = now.getHours();
    return hour >= 12 && hour <= 14; // 12:00-14:00 grace window
  }

  // ── 76.7: Session depth tracking ────────────────────────────

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

  // ── Helpers ─────────────────────────────────────────────────

  private formatViewCount(count: number): string {
    if (count >= 1000000) return `${(count / 1000000).toFixed(0)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toString();
  }
}

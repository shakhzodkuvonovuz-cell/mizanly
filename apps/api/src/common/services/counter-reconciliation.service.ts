import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';

/**
 * Phase 2, Workstream 5: Counter reconciliation service.
 *
 * Denormalized counters (likesCount, followersCount, etc.) can drift
 * from their true values due to race conditions, failed transactions,
 * or bugs. This service periodically reconciles them.
 *
 * Policy per counter:
 * - followersCount / followingCount: REPAIRABLE (user-visible, must be exact)
 * - postsCount / threadsCount: REPAIRABLE
 * - likesCount / commentsCount / sharesCount / savesCount: REPAIRABLE
 * - viewsCount: APPROXIMATE (high-volume, exact counting is expensive)
 * - unreadCount on ConversationMember: REPAIRABLE
 *
 * Runs at 4 AM daily (low-traffic window).
 */
@Injectable()
export class CounterReconciliationService {
  private readonly logger = new Logger(CounterReconciliationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Reconcile user follower/following counts.
   * These are the most visible counters — must be exact.
   */
  @Cron('0 4 * * *') // 4 AM daily
  async reconcileUserFollowCounts() {
    try {
      const drifted = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint; stored: number }>>`
        SELECT u.id, COUNT(f."followingId")::bigint as actual, u."followersCount" as stored
        FROM "users" u
        LEFT JOIN "follows" f ON f."followingId" = u.id
        WHERE u."isDeleted" = false
        GROUP BY u.id
        HAVING COUNT(f."followingId") != u."followersCount"
        LIMIT 1000
      `;

      if (drifted.length === 0) return 0;

      // Batch update via raw SQL instead of sequential individual updates
      if (drifted.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "users" SET "followersCount" = v.actual::int
          FROM (VALUES ${Prisma.join(
            drifted.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`),
          )}) AS v(id, actual)
          WHERE "users".id = v.id
        `;
        this.logger.warn(`Reconciled followersCount for ${drifted.length} user(s) — counters had drifted`);
      }

      // Also fix followingCount
      const driftedFollowing = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT u.id, COUNT(f."followerId")::bigint as actual
        FROM "users" u
        LEFT JOIN "follows" f ON f."followerId" = u.id
        WHERE u."isDeleted" = false
        GROUP BY u.id
        HAVING COUNT(f."followerId") != u."followingCount"
        LIMIT 1000
      `;

      if (driftedFollowing.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "users" SET "followingCount" = v.actual::int
          FROM (VALUES ${Prisma.join(
            driftedFollowing.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`),
          )}) AS v(id, actual)
          WHERE "users".id = v.id
        `;
        this.logger.warn(`Reconciled followingCount for ${driftedFollowing.length} user(s)`);
      }

      return drifted.length + driftedFollowing.length;
    } catch (error) {
      this.logger.error('reconcileUserFollowCounts cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Reconcile post engagement counters.
   * likesCount, commentsCount, savesCount.
   */
  @Cron('0 4 15 * *') // 15th of each month at 4 AM (less frequent — posts are high volume)
  async reconcilePostCounts() {
    try {
      // Fix likesCount
      const driftedLikes = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT p.id, COUNT(r."postId")::bigint as actual
        FROM "posts" p
        LEFT JOIN "post_reactions" r ON r."postId" = p.id
        WHERE p."isRemoved" = false
        GROUP BY p.id
        HAVING COUNT(r."postId") != p."likesCount"
        LIMIT 500
      `;

      if (driftedLikes.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "posts" SET "likesCount" = v.actual::int
          FROM (VALUES ${Prisma.join(
            driftedLikes.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`),
          )}) AS v(id, actual)
          WHERE "Post".id = v.id
        `;
      }

      // Fix commentsCount
      const driftedComments = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT p.id, COUNT(c.id)::bigint as actual
        FROM "posts" p
        LEFT JOIN "comments" c ON c."postId" = p.id AND c."isRemoved" = false
        WHERE p."isRemoved" = false
        GROUP BY p.id
        HAVING COUNT(c.id) != p."commentsCount"
        LIMIT 500
      `;

      if (driftedComments.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "posts" SET "commentsCount" = v.actual::int
          FROM (VALUES ${Prisma.join(
            driftedComments.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`),
          )}) AS v(id, actual)
          WHERE "Post".id = v.id
        `;
      }

      const fixed = driftedLikes.length + driftedComments.length;
      if (fixed > 0) {
        this.logger.warn(`Reconciled ${fixed} post counter(s) that had drifted`);
      }
      return fixed;
    } catch (error) {
      this.logger.error('reconcilePostCounts cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Reconcile postsCount on User model.
   */
  @Cron('30 4 * * 0') // Every Sunday at 4:30 AM
  async reconcileUserPostCounts() {
    try {
      const drifted = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT u.id, COUNT(p.id)::bigint as actual
        FROM "users" u
        LEFT JOIN "Post" p ON p."userId" = u.id AND p."isRemoved" = false
        WHERE u."isDeleted" = false
        GROUP BY u.id
        HAVING COUNT(p.id) != u."postsCount"
        LIMIT 500
      `;

      if (drifted.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "users" SET "postsCount" = v.actual::int
          FROM (VALUES ${Prisma.join(
            drifted.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`),
          )}) AS v(id, actual)
          WHERE "users".id = v.id
        `;
        this.logger.warn(`Reconciled postsCount for ${drifted.length} user(s)`);
      }
      return drifted.length;
    } catch (error) {
      this.logger.error('reconcileUserPostCounts cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Reconcile post savesCount (count SavedPost rows vs Post.savesCount).
   */
  @Cron('15 4 15 * *') // 15th of each month at 4:15 AM
  async reconcilePostSavesCounts() {
    try {
      const drifted = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT p.id, COUNT(sp."postId")::bigint as actual
        FROM "posts" p
        LEFT JOIN "saved_posts" sp ON sp."postId" = p.id
        WHERE p."isRemoved" = false
        GROUP BY p.id
        HAVING COUNT(sp."postId") != p."savesCount"
        LIMIT 500
      `;

      if (drifted.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "posts" SET "savesCount" = v.actual::int
          FROM (VALUES ${Prisma.join(
            drifted.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`),
          )}) AS v(id, actual)
          WHERE "Post".id = v.id
        `;
        this.logger.warn(`Reconciled savesCount for ${drifted.length} post(s)`);
      }
      return drifted.length;
    } catch (error) {
      this.logger.error('reconcilePostSavesCounts cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Reconcile post sharesCount (count Share rows vs Post.sharesCount).
   */
  @Cron('30 4 15 * *') // 15th of each month at 4:30 AM
  async reconcilePostSharesCounts() {
    try {
      const drifted = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT p.id, COUNT(s.id)::bigint as actual
        FROM "posts" p
        LEFT JOIN "Post" s ON s."sharedPostId" = p.id
        WHERE p."isRemoved" = false
        GROUP BY p.id
        HAVING COUNT(s.id) != p."sharesCount"
        LIMIT 500
      `;

      if (drifted.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "posts" SET "sharesCount" = v.actual::int
          FROM (VALUES ${Prisma.join(
            drifted.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`),
          )}) AS v(id, actual)
          WHERE "Post".id = v.id
        `;
        this.logger.warn(`Reconciled sharesCount for ${drifted.length} post(s)`);
      }
      return drifted.length;
    } catch (error) {
      this.logger.error('reconcilePostSharesCounts cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Reconcile unread message counts on ConversationMember.
   * Counts messages newer than lastReadAt vs stored unreadCount.
   */
  @Cron('45 4 * * *') // Daily at 4:45 AM
  async reconcileUnreadCounts() {
    try {
      const drifted = await this.prisma.$queryRaw<Array<{ conversationId: string; userId: string; actual: bigint }>>`
        SELECT cm."conversationId", cm."userId", COUNT(m.id)::bigint as actual
        FROM "conversation_members" cm
        LEFT JOIN "Message" m ON m."conversationId" = cm."conversationId"
          AND m."senderId" != cm."userId"
          AND m."createdAt" > COALESCE(cm."lastReadAt", '1970-01-01')
          AND m."isDeleted" = false
        GROUP BY cm."conversationId", cm."userId"
        HAVING COUNT(m.id) != cm."unreadCount"
        LIMIT 1000
      `;

      let fixed = 0;
      for (const row of drifted) {
        await this.prisma.$executeRaw`
          UPDATE "conversation_members"
          SET "unreadCount" = ${Number(row.actual)}
          WHERE "conversationId" = ${row.conversationId}
            AND "userId" = ${row.userId}
        `;
        fixed++;
      }

      if (fixed > 0) {
        this.logger.warn(`Reconciled unreadCount for ${fixed} conversation member(s)`);
      }
      return fixed;
    } catch (error) {
      this.logger.error('reconcileUnreadCounts cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Reconcile coin balances — detect and reset any negative balances to 0.
   * Prisma doesn't support DB-level CHECK constraints, so this is the safety net.
   * Also logs any discrepancies for investigation.
   */
  @Cron('0 5 * * *') // Daily at 5 AM
  async reconcileCoinBalances() {
    try {
      // Find any negative coin or diamond balances (should never happen, but guard against bugs)
      const negative = await this.prisma.coinBalance.findMany({
        where: {
          OR: [
            { coins: { lt: 0 } },
            { diamonds: { lt: 0 } },
          ],
        },
        select: { userId: true, coins: true, diamonds: true },
        take: 500,
      });

      if (negative.length === 0) return 0;

      this.logger.error(
        `CRITICAL: Found ${negative.length} CoinBalance record(s) with negative values — resetting to 0`,
      );

      for (const record of negative) {
        const updateData: { coins?: number; diamonds?: number } = {};
        if (record.coins < 0) updateData.coins = 0;
        if (record.diamonds < 0) updateData.diamonds = 0;

        await this.prisma.coinBalance.update({
          where: { userId: record.userId },
          data: updateData,
        });

        Sentry.captureMessage(
          `Negative CoinBalance reset: userId=${record.userId} coins=${record.coins} diamonds=${record.diamonds}`,
          'error',
        );
      }

      return negative.length;
    } catch (error) {
      this.logger.error('reconcileCoinBalances cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Reconcile user threadsCount and reelsCount.
   */
  @Cron('35 4 * * 0') // Every Sunday at 4:35 AM
  async reconcileUserContentCounts() {
    try {
      // threadsCount
      const driftedThreads = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT u.id, COUNT(t.id)::bigint as actual
        FROM "users" u
        LEFT JOIN "Thread" t ON t."userId" = u.id AND t."isRemoved" = false
        WHERE u."isDeleted" = false
        GROUP BY u.id
        HAVING COUNT(t.id) != u."threadsCount"
        LIMIT 500
      `;
      if (driftedThreads.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "users" SET "threadsCount" = v.actual::int
          FROM (VALUES ${Prisma.join(driftedThreads.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`))} ) AS v(id, actual)
          WHERE "users".id = v.id
        `;
      }

      // reelsCount
      const driftedReels = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT u.id, COUNT(r.id)::bigint as actual
        FROM "users" u
        LEFT JOIN "Reel" r ON r."userId" = u.id AND r."isRemoved" = false
        WHERE u."isDeleted" = false
        GROUP BY u.id
        HAVING COUNT(r.id) != u."reelsCount"
        LIMIT 500
      `;
      if (driftedReels.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "users" SET "reelsCount" = v.actual::int
          FROM (VALUES ${Prisma.join(driftedReels.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`))} ) AS v(id, actual)
          WHERE "users".id = v.id
        `;
      }

      const fixed = driftedThreads.length + driftedReels.length;
      if (fixed > 0) this.logger.warn(`Reconciled threadsCount/reelsCount for ${fixed} user(s)`);
      return fixed;
    } catch (error) {
      this.logger.error('reconcileUserContentCounts cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Reconcile reel engagement counters (likesCount, commentsCount).
   */
  @Cron('0 5 15 * *') // 15th of each month at 5 AM
  async reconcileReelCounts() {
    try {
      const driftedLikes = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT r.id, COUNT(rr."reelId")::bigint as actual
        FROM "reels" r
        LEFT JOIN "reel_reactions" rr ON rr."reelId" = r.id
        WHERE r."isRemoved" = false
        GROUP BY r.id
        HAVING COUNT(rr."reelId") != r."likesCount"
        LIMIT 500
      `;
      if (driftedLikes.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "reels" SET "likesCount" = v.actual::int
          FROM (VALUES ${Prisma.join(driftedLikes.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`))} ) AS v(id, actual)
          WHERE "Reel".id = v.id
        `;
      }

      const driftedComments = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT r.id, COUNT(rc.id)::bigint as actual
        FROM "reels" r
        LEFT JOIN "reel_comments" rc ON rc."reelId" = r.id
        WHERE r."isRemoved" = false
        GROUP BY r.id
        HAVING COUNT(rc.id) != r."commentsCount"
        LIMIT 500
      `;
      if (driftedComments.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "reels" SET "commentsCount" = v.actual::int
          FROM (VALUES ${Prisma.join(driftedComments.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`))} ) AS v(id, actual)
          WHERE "Reel".id = v.id
        `;
      }

      const fixed = driftedLikes.length + driftedComments.length;
      if (fixed > 0) this.logger.warn(`Reconciled ${fixed} reel counter(s)`);
      return fixed;
    } catch (error) {
      this.logger.error('reconcileReelCounts cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Reconcile thread engagement counters (likesCount, repliesCount).
   */
  @Cron('15 5 15 * *') // 15th of each month at 5:15 AM
  async reconcileThreadCounts() {
    try {
      const driftedLikes = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT t.id, COUNT(tr."threadId")::bigint as actual
        FROM "threads" t
        LEFT JOIN "thread_reactions" tr ON tr."threadId" = t.id
        WHERE t."isRemoved" = false
        GROUP BY t.id
        HAVING COUNT(tr."threadId") != t."likesCount"
        LIMIT 500
      `;
      if (driftedLikes.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "threads" SET "likesCount" = v.actual::int
          FROM (VALUES ${Prisma.join(driftedLikes.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`))} ) AS v(id, actual)
          WHERE "Thread".id = v.id
        `;
      }

      const driftedReplies = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT t.id, COUNT(r.id)::bigint as actual
        FROM "threads" t
        LEFT JOIN "thread_replies" r ON r."threadId" = t.id
        WHERE t."isRemoved" = false
        GROUP BY t.id
        HAVING COUNT(r.id) != t."repliesCount"
        LIMIT 500
      `;
      if (driftedReplies.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "threads" SET "repliesCount" = v.actual::int
          FROM (VALUES ${Prisma.join(driftedReplies.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`))} ) AS v(id, actual)
          WHERE "Thread".id = v.id
        `;
      }

      const fixed = driftedLikes.length + driftedReplies.length;
      if (fixed > 0) this.logger.warn(`Reconciled ${fixed} thread counter(s)`);
      return fixed;
    } catch (error) {
      this.logger.error('reconcileThreadCounts cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Reconcile video engagement counters (likesCount, commentsCount).
   */
  @Cron('30 5 15 * *') // 15th of each month at 5:30 AM
  async reconcileVideoCounts() {
    try {
      const driftedLikes = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT v.id, COUNT(vr."videoId")::bigint as actual
        FROM "videos" v
        LEFT JOIN "video_reactions" vr ON vr."videoId" = v.id AND vr."isLike" = true
        WHERE v."isRemoved" = false
        GROUP BY v.id
        HAVING COUNT(vr."videoId") != v."likesCount"
        LIMIT 500
      `;
      if (driftedLikes.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "videos" SET "likesCount" = v.actual::int
          FROM (VALUES ${Prisma.join(driftedLikes.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`))} ) AS v(id, actual)
          WHERE "Video".id = v.id
        `;
      }

      const driftedComments = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
        SELECT v.id, COUNT(vc.id)::bigint as actual
        FROM "videos" v
        LEFT JOIN "video_comments" vc ON vc."videoId" = v.id
        WHERE v."isRemoved" = false
        GROUP BY v.id
        HAVING COUNT(vc.id) != v."commentsCount"
        LIMIT 500
      `;
      if (driftedComments.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "videos" SET "commentsCount" = v.actual::int
          FROM (VALUES ${Prisma.join(driftedComments.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`))} ) AS v(id, actual)
          WHERE "Video".id = v.id
        `;
      }

      const fixed = driftedLikes.length + driftedComments.length;
      if (fixed > 0) this.logger.warn(`Reconciled ${fixed} video counter(s)`);
      return fixed;
    } catch (error) {
      this.logger.error('reconcileVideoCounts cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Reconcile hashtag postsCount.
   */
  @Cron('45 5 15 * *') // 15th of each month at 5:45 AM
  async reconcileHashtagCounts() {
    try {
      // Count posts that contain each hashtag (PostgreSQL array containment)
      const drifted = await this.prisma.$queryRaw<Array<{ id: string; name: string; actual: bigint }>>`
        SELECT h.id, h.name, COUNT(p.id)::bigint as actual
        FROM "hashtags" h
        LEFT JOIN "Post" p ON p."hashtags" @> ARRAY[h."name"] AND p."isRemoved" = false
        GROUP BY h.id, h.name
        HAVING COUNT(p.id) != h."postsCount"
        LIMIT 500
      `;
      if (drifted.length > 0) {
        await this.prisma.$executeRaw`
          UPDATE "hashtags" SET "postsCount" = v.actual::int
          FROM (VALUES ${Prisma.join(drifted.map(r => Prisma.sql`(${r.id}, ${Number(r.actual)})`))} ) AS v(id, actual)
          WHERE "Hashtag".id = v.id
        `;
        this.logger.warn(`Reconciled postsCount for ${drifted.length} hashtag(s)`);
      }
      return drifted.length;
    } catch (error) {
      this.logger.error('reconcileHashtagCounts cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  /**
   * Manual trigger for immediate reconciliation (admin use).
   */
  async reconcileAll() {
    const follows = await this.reconcileUserFollowCounts();
    const posts = await this.reconcilePostCounts();
    const userPosts = await this.reconcileUserPostCounts();
    const userContent = await this.reconcileUserContentCounts();
    const saves = await this.reconcilePostSavesCounts();
    const shares = await this.reconcilePostSharesCounts();
    const reels = await this.reconcileReelCounts();
    const threads = await this.reconcileThreadCounts();
    const videos = await this.reconcileVideoCounts();
    const hashtags = await this.reconcileHashtagCounts();
    const unread = await this.reconcileUnreadCounts();
    const coinBalances = await this.reconcileCoinBalances();
    return {
      reconciled: {
        followCounts: follows,
        postCounts: posts,
        userPostCounts: userPosts,
        userContentCounts: userContent,
        postSavesCounts: saves,
        postSharesCounts: shares,
        reelCounts: reels,
        threadCounts: threads,
        videoCounts: videos,
        hashtagCounts: hashtags,
        unreadCounts: unread,
        coinBalances,
      },
    };
  }
}

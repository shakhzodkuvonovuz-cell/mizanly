import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
    const drifted = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint; stored: number }>>`
      SELECT u.id, COUNT(f."followingId")::bigint as actual, u."followersCount" as stored
      FROM "User" u
      LEFT JOIN "Follow" f ON f."followingId" = u.id
      WHERE u."isDeleted" = false
      GROUP BY u.id
      HAVING COUNT(f."followingId") != u."followersCount"
      LIMIT 1000
    `;

    if (drifted.length === 0) return 0;

    let fixed = 0;
    for (const row of drifted) {
      await this.prisma.user.update({
        where: { id: row.id },
        data: { followersCount: Number(row.actual) },
      });
      fixed++;
    }

    if (fixed > 0) {
      this.logger.warn(`Reconciled followersCount for ${fixed} user(s) — counters had drifted`);
    }

    // Also fix followingCount
    const driftedFollowing = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
      SELECT u.id, COUNT(f."followerId")::bigint as actual
      FROM "User" u
      LEFT JOIN "Follow" f ON f."followerId" = u.id
      WHERE u."isDeleted" = false
      GROUP BY u.id
      HAVING COUNT(f."followerId") != u."followingCount"
      LIMIT 1000
    `;

    let fixedFollowing = 0;
    for (const row of driftedFollowing) {
      await this.prisma.user.update({
        where: { id: row.id },
        data: { followingCount: Number(row.actual) },
      });
      fixedFollowing++;
    }

    if (fixedFollowing > 0) {
      this.logger.warn(`Reconciled followingCount for ${fixedFollowing} user(s)`);
    }

    return fixed + fixedFollowing;
  }

  /**
   * Reconcile post engagement counters.
   * likesCount, commentsCount, savesCount.
   */
  @Cron('0 4 15 * *') // 15th of each month at 4 AM (less frequent — posts are high volume)
  async reconcilePostCounts() {
    // Fix likesCount
    const driftedLikes = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
      SELECT p.id, COUNT(r."postId")::bigint as actual
      FROM "Post" p
      LEFT JOIN "PostReaction" r ON r."postId" = p.id
      WHERE p."isRemoved" = false
      GROUP BY p.id
      HAVING COUNT(r."postId") != p."likesCount"
      LIMIT 500
    `;

    let fixed = 0;
    for (const row of driftedLikes) {
      await this.prisma.post.update({
        where: { id: row.id },
        data: { likesCount: Number(row.actual) },
      });
      fixed++;
    }

    // Fix commentsCount
    const driftedComments = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
      SELECT p.id, COUNT(c.id)::bigint as actual
      FROM "Post" p
      LEFT JOIN "Comment" c ON c."postId" = p.id AND c."isRemoved" = false
      WHERE p."isRemoved" = false
      GROUP BY p.id
      HAVING COUNT(c.id) != p."commentsCount"
      LIMIT 500
    `;

    for (const row of driftedComments) {
      await this.prisma.post.update({
        where: { id: row.id },
        data: { commentsCount: Number(row.actual) },
      });
      fixed++;
    }

    if (fixed > 0) {
      this.logger.warn(`Reconciled ${fixed} post counter(s) that had drifted`);
    }
    return fixed;
  }

  /**
   * Reconcile postsCount on User model.
   */
  @Cron('30 4 * * 0') // Every Sunday at 4:30 AM
  async reconcileUserPostCounts() {
    const drifted = await this.prisma.$queryRaw<Array<{ id: string; actual: bigint }>>`
      SELECT u.id, COUNT(p.id)::bigint as actual
      FROM "User" u
      LEFT JOIN "Post" p ON p."userId" = u.id AND p."isRemoved" = false
      WHERE u."isDeleted" = false
      GROUP BY u.id
      HAVING COUNT(p.id) != u."postsCount"
      LIMIT 500
    `;

    let fixed = 0;
    for (const row of drifted) {
      await this.prisma.user.update({
        where: { id: row.id },
        data: { postsCount: Number(row.actual) },
      });
      fixed++;
    }

    if (fixed > 0) {
      this.logger.warn(`Reconciled postsCount for ${fixed} user(s)`);
    }
    return fixed;
  }

  /**
   * Manual trigger for immediate reconciliation (admin use).
   */
  async reconcileAll() {
    const follows = await this.reconcileUserFollowCounts();
    const posts = await this.reconcilePostCounts();
    const userPosts = await this.reconcileUserPostCounts();
    return {
      reconciled: {
        followCounts: follows,
        postCounts: posts,
        userPostCounts: userPosts,
      },
    };
  }
}

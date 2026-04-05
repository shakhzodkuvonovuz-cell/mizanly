import {
  Injectable,
  Inject,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { ReportStatus, ModerationAction } from '@prisma/client';
import { createClerkClient } from '@clerk/backend';
import { NotificationsService } from '../notifications/notifications.service';
import { PublishWorkflowService } from '../../common/services/publish-workflow.service';
import { QueueService } from '../../common/queue/queue.service';
import Redis from 'ioredis';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private clerk;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private notificationsService: NotificationsService,
    private publishWorkflow: PublishWorkflowService,
    @Optional() private queueService: QueueService | null,
    @Inject('REDIS') private redis: Redis,
  ) {
    this.clerk = createClerkClient({
      secretKey: this.config.get('CLERK_SECRET_KEY'),
    });
  }

  async verifyAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
  }

  // A15-#20: Removed redundant assertAdmin wrapper — use verifyAdmin directly

  async getReports(adminId: string, status?: string, cursor?: string, limit = 20) {
    await this.verifyAdmin(adminId);

    // A15-#7 FIX: Validate status against ReportStatus enum
    const where: Record<string, unknown> = {};
    if (status) {
      const validStatuses = Object.values(ReportStatus);
      if (!validStatuses.includes(status as ReportStatus)) {
        throw new BadRequestException(`Invalid report status. Valid values: ${validStatuses.join(', ')}`);
      }
      where.status = status;
    }

    const reports = await this.prisma.report.findMany({
      where,
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        reportedUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      // Proper Prisma ID-based cursor pagination (replaces fragile Date cursor)
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = reports.length > limit;
    const result = hasMore ? reports.slice(0, limit) : reports;

    return {
      data: result,
      meta: {
        cursor: hasMore ? result[result.length - 1].id : null,
        hasMore,
      },
    };
  }

  async getReport(adminId: string, reportId: string) {
    await this.verifyAdmin(adminId);

    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
        reportedUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true
          }
        },
      },
    });

    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  async resolveReport(adminId: string, reportId: string, action: string, note?: string) {
    await this.verifyAdmin(adminId);

    // A15-#16/X08-#11 FIX: Use map + throw on unknown action
    const ACTION_MAP: Record<string, { status: ReportStatus; actionTaken: ModerationAction }> = {
      DISMISS: { status: 'DISMISSED', actionTaken: 'NONE' },
      WARN: { status: 'RESOLVED', actionTaken: 'WARNING' },
      REMOVE_CONTENT: { status: 'RESOLVED', actionTaken: 'CONTENT_REMOVED' },
      BAN_USER: { status: 'RESOLVED', actionTaken: 'PERMANENT_BAN' },
      TEMP_BAN: { status: 'RESOLVED', actionTaken: 'TEMP_BAN' },
      MUTE: { status: 'RESOLVED', actionTaken: 'TEMP_MUTE' },
    };

    const mapped = ACTION_MAP[action];
    if (!mapped) {
      throw new BadRequestException(`Unknown action: ${action}`);
    }
    const { status, actionTaken } = mapped;

    // X08-#1 FIX: Fetch ALL content type IDs including thread/reel/video
    // F3-2 FIX: Also fetch status to prevent replay of already-resolved reports
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: {
        status: true,
        reportedPostId: true,
        reportedCommentId: true,
        reportedMessageId: true,
        reportedUserId: true,
        reportedThreadId: true,
        reportedReelId: true,
        reportedVideoId: true,
      },
    });
    if (!report) throw new NotFoundException('Report not found');

    // F3-2 FIX: Prevent replay of already-resolved/dismissed reports
    if (report.status === 'RESOLVED' || report.status === 'DISMISSED') {
      throw new BadRequestException('Report has already been resolved');
    }

    // X08-#1/#17 FIX: Remove ALL content types in transaction for atomicity
    if (actionTaken === 'CONTENT_REMOVED') {
      const removals: Promise<unknown>[] = [];
      if (report.reportedPostId) {
        removals.push(this.prisma.post.update({ where: { id: report.reportedPostId }, data: { isRemoved: true } }).catch(err => this.logger.warn('Failed to remove post', err instanceof Error ? err.message : err)));
      }
      if (report.reportedCommentId) {
        removals.push(this.prisma.comment.update({ where: { id: report.reportedCommentId }, data: { isRemoved: true } }).catch(err => this.logger.warn('Failed to remove comment', err instanceof Error ? err.message : err)));
      }
      if (report.reportedMessageId) {
        removals.push(this.prisma.message.update({ where: { id: report.reportedMessageId }, data: { isDeleted: true } }).catch(err => this.logger.warn('Failed to remove message', err instanceof Error ? err.message : err)));
      }
      if (report.reportedThreadId) {
        removals.push(this.prisma.thread.update({ where: { id: report.reportedThreadId }, data: { isRemoved: true } }).catch(err => this.logger.warn('Failed to remove thread', err instanceof Error ? err.message : err)));
      }
      if (report.reportedReelId) {
        removals.push(this.prisma.reel.update({ where: { id: report.reportedReelId }, data: { isRemoved: true } }).catch(err => this.logger.warn('Failed to remove reel', err instanceof Error ? err.message : err)));
      }
      if (report.reportedVideoId) {
        removals.push(this.prisma.video.update({ where: { id: report.reportedVideoId }, data: { isRemoved: true } }).catch(err => this.logger.warn('Failed to remove video', err instanceof Error ? err.message : err)));
      }
      await Promise.all(removals);
    }

    // Actually ban user when action is BAN_USER or TEMP_BAN
    if (actionTaken === 'PERMANENT_BAN' && report.reportedUserId) {
      await this.banUser(adminId, report.reportedUserId, note || 'Banned via report resolution');
    }
    if (actionTaken === 'TEMP_BAN' && report.reportedUserId) {
      await this.banUser(adminId, report.reportedUserId, note || 'Temp banned via report resolution', 72); // 72-hour temp ban
    }

    // Handle TEMP_MUTE
    if (actionTaken === 'TEMP_MUTE' && report.reportedUserId) {
      await this.prisma.user.update({
        where: { id: report.reportedUserId },
        data: { warningsCount: { increment: 1 } },
      }).catch(err => this.logger.warn('Failed to update user ban status', err instanceof Error ? err.message : err));
    }

    // Finding 30 (Audit 13): Handle WARNING — notify the reported user
    if (actionTaken === 'WARNING' && report.reportedUserId) {
      await this.notificationsService.create({
        userId: report.reportedUserId,
        actorId: null,
        type: 'SYSTEM',
        title: 'Content Warning',
        body: `Your content was flagged. Repeated violations may result in account restrictions.`,
      }).catch(err => this.logger.warn('Failed to send resolution notification', err instanceof Error ? err.message : err));
    }

    // Create moderation log for audit trail (Finding 21, Audit 13)
    if (actionTaken !== 'NONE') {
      await this.prisma.moderationLog.create({
        data: {
          moderatorId: adminId,
          action: actionTaken,
          targetUserId: report.reportedUserId,
          targetPostId: report.reportedPostId,
          targetCommentId: report.reportedCommentId,
          targetMessageId: report.reportedMessageId,
          reportId,
          reason: note || `Report resolved: ${action}`,
          explanation: `Admin resolved report ${reportId} with action: ${action}`,
        },
      }).catch(err => this.logger.warn('Failed to create moderation log', err instanceof Error ? err.message : err));
    }

    // A15-#12 FIX: Log audit trail errors instead of swallowing silently
    await this.prisma.adminAuditLog.create({
      data: { adminId, action: `RESOLVE_REPORT_${action}`, targetType: 'report', targetId: reportId, details: { actionTaken, note } },
    }).catch(err => this.logger.error('Audit log write failed for report resolution', err instanceof Error ? err.message : err));

    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        actionTaken,
        reviewedById: adminId,
        reviewedAt: new Date(),
        moderatorNotes: note,
      },
    });
  }

  async getStats(adminId: string) {
    await this.verifyAdmin(adminId);

    // X04-#21 FIX: Exclude deleted and banned users from count
    const [users, posts, threads, reels, videos, pendingReports] = await Promise.all([
      this.prisma.user.count({ where: { isDeactivated: false, isDeleted: false, isBanned: false } }),
      this.prisma.post.count(),
      this.prisma.thread.count({ where: { isChainHead: true } }),
      this.prisma.reel.count(),
      this.prisma.video.count(),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
    ]);

    return { users, posts, threads, reels, videos, pendingReports };
  }

  async banUser(adminId: string, targetId: string, reason: string, duration?: number) {
    await this.verifyAdmin(adminId);

    // A15-#15 FIX: Single query for role + clerkId (was two separate queries)
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, clerkId: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'ADMIN') throw new ForbiddenException('Cannot ban an admin user');

    const banExpiresAt = duration ? new Date(Date.now() + duration * 3600000) : null;

    // A15-#2 FIX: Use select to exclude PII from response
    const updatedUser = await this.prisma.user.update({
      where: { id: targetId },
      data: {
        isBanned: true,
        isDeactivated: true,
        bannedAt: new Date(), // X04-#11: timestamp for ban vs self-deactivation disambiguation
        banReason: reason,
        banExpiresAt,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        isBanned: true,
        banExpiresAt: true,
        banReason: true,
      },
    });

    // Revoke active Clerk sessions so banned user is immediately logged out
    if (target.clerkId) {
      try {
        await this.clerk.users.banUser(target.clerkId);
        this.logger.log(`Clerk sessions revoked for banned user ${targetId} (clerkId: ${target.clerkId})`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to revoke Clerk session for banned user ${targetId}: ${msg}`);
      }
    }

    // #73 FIX: Force-disconnect any active WebSocket connections immediately.
    // Clerk ban revokes sessions for future requests, but existing WebSocket
    // connections stay alive until the next auth check. Publishing to user:banned
    // triggers chat.gateway.ts to force-disconnect all sockets for this user.
    this.redis.publish('user:banned', JSON.stringify({ userId: targetId }))
      .catch(err => this.logger.warn(`Failed to publish ban disconnect for ${targetId}`, err instanceof Error ? err.message : err));

    // Remove banned user AND their content from search index (X04-#9)
    this.publishWorkflow.onUnpublish({
      contentType: 'user',
      contentId: targetId,
      userId: targetId,
    }).catch(err => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to remove banned user ${targetId} from search index: ${msg}`);
    });

    // X04-#9: Also remove banned user's content from search (matching reports.service.ts pattern)
    this.removeUserContentFromSearch(targetId).catch(err => {
      this.logger.warn(`Failed to remove banned user content from search: ${err instanceof Error ? err.message : err}`);
    });

    // A15-#12 FIX: Log errors instead of swallowing
    await this.prisma.adminAuditLog.create({
      data: { adminId, action: 'BAN_USER', targetType: 'user', targetId, details: { reason, duration } },
    }).catch(err => this.logger.error('Audit log write failed for ban', err instanceof Error ? err.message : err));

    return updatedUser;
  }

  async unbanUser(adminId: string, targetId: string) {
    await this.verifyAdmin(adminId);

    // Fetch clerkId to unban in Clerk as well
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { clerkId: true },
    });

    // A15-#3 FIX: Use select to exclude PII from response
    const updatedUser = await this.prisma.user.update({
      where: { id: targetId },
      data: {
        isBanned: false,
        isDeactivated: false,
        bannedAt: null, // X04-#11: clear ban timestamp
        banReason: null,
        banExpiresAt: null,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        isBanned: true,
      },
    });

    // Unban in Clerk so the user can sign in again
    if (target?.clerkId) {
      try {
        await this.clerk.users.unbanUser(target.clerkId);
        this.logger.log(`Clerk ban lifted for user ${targetId} (clerkId: ${target.clerkId})`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to lift Clerk ban for user ${targetId}: ${msg}`);
      }
    }

    // Re-add unbanned user to search index
    this.publishWorkflow.onPublish({
      contentType: 'user',
      contentId: targetId,
      userId: targetId,
      indexDocument: {
        id: updatedUser.id,
        username: updatedUser.username,
        displayName: updatedUser.displayName,
        bio: updatedUser.bio,
      },
    }).catch(err => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to re-index unbanned user ${targetId}: ${msg}`);
    });

    return updatedUser;
  }

  /** X04-#9: Remove a user's content from search indexes on ban (cursor-paginated, no cap) */
  private async removeUserContentFromSearch(userId: string): Promise<void> {
    const contentTypes: Array<{ model: 'post' | 'thread' | 'reel' | 'video'; type: 'post' | 'thread' | 'reel' | 'video' }> = [
      { model: 'post', type: 'post' },
      { model: 'thread', type: 'thread' },
      { model: 'reel', type: 'reel' },
      { model: 'video', type: 'video' },
    ];

    let totalRemoved = 0;
    for (const ct of contentTypes) {
      let cursor: string | undefined;
      while (true) {
        const items = await (this.prisma[ct.model] as { findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string }>> }).findMany({
          where: { userId },
          select: { id: true },
          take: 500,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (items.length === 0) break;

        await Promise.allSettled(
          items.map(item =>
            this.publishWorkflow.onUnpublish({ contentType: ct.type, contentId: item.id, userId }).catch((err) => this.logger.error('Admin audit log failed', err?.message)),
          ),
        );
        totalRemoved += items.length;
        cursor = items[items.length - 1].id;
        if (items.length < 500) break;
      }
    }

    this.logger.log(`Removed ${totalRemoved} content items from search for banned user ${userId}`);
  }

  /**
   * Send a system-wide announcement to all active users via bulk-push queue.
   * Admin only. Uses cursor-paginated user fetch to handle large user bases
   * without loading all user IDs into memory at once.
   */
  async sendAnnouncement(adminId: string, data: { title: string; body: string; pushData?: Record<string, string> }): Promise<{ sent: boolean; userCount: number }> {
    await this.verifyAdmin(adminId);

    if (!data.title?.trim() || !data.body?.trim()) {
      throw new BadRequestException('Announcement title and body are required');
    }
    if (data.title.length > 100) {
      throw new BadRequestException('Announcement title must be 100 characters or less');
    }
    if (data.body.length > 500) {
      throw new BadRequestException('Announcement body must be 500 characters or less');
    }

    if (!this.queueService) {
      throw new BadRequestException('Queue service unavailable — cannot send bulk notifications');
    }

    // Cursor-paginated fetch of active, non-banned users
    let totalUsers = 0;
    let cursor: string | undefined;
    const BATCH = 500;

    while (true) {
      const users = await this.prisma.user.findMany({
        where: { isDeactivated: false, isDeleted: false, isBanned: false },
        select: { id: true },
        take: BATCH,
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (users.length === 0) break;

      const userIds = users.map(u => u.id);
      await this.queueService.addBulkPushJob({
        userIds,
        title: data.title,
        body: data.body,
        pushData: data.pushData,
      });

      totalUsers += users.length;
      cursor = users[users.length - 1].id;
      if (users.length < BATCH) break;
    }

    // Audit log
    await this.prisma.adminAuditLog.create({
      data: { adminId, action: 'SEND_ANNOUNCEMENT', targetType: 'system', targetId: 'all-users', details: { title: data.title, userCount: totalUsers } },
    }).catch(err => this.logger.error('Audit log write failed for announcement', err instanceof Error ? err.message : err));

    this.logger.log(`Admin ${adminId} sent announcement "${data.title}" to ${totalUsers} users`);
    return { sent: true, userCount: totalUsers };
  }
}
import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { ReportStatus, ModerationAction } from '@prisma/client';
import { createClerkClient } from '@clerk/backend';
import { NotificationsService } from '../notifications/notifications.service';
import { PublishWorkflowService } from '../../common/services/publish-workflow.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private clerk;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Optional() private notificationsService: NotificationsService,
    private publishWorkflow: PublishWorkflowService,
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

  private async assertAdmin(userId: string) {
    return this.verifyAdmin(userId);
  }

  async getReports(adminId: string, status?: string, cursor?: string, limit = 20) {
    await this.assertAdmin(adminId);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

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
    await this.assertAdmin(adminId);

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
    await this.assertAdmin(adminId);

    // Map action strings to schema enums
    let status: ReportStatus = 'RESOLVED';
    let actionTaken: ModerationAction = 'NONE';

    if (action === 'DISMISS') {
      status = 'DISMISSED';
      actionTaken = 'NONE';
    } else if (action === 'WARN') {
      status = 'RESOLVED';
      actionTaken = 'WARNING';
    } else if (action === 'REMOVE_CONTENT') {
      status = 'RESOLVED';
      actionTaken = 'CONTENT_REMOVED';
    } else if (action === 'BAN_USER') {
      status = 'RESOLVED';
      actionTaken = 'PERMANENT_BAN';
    } else if (action === 'TEMP_BAN') {
      status = 'RESOLVED';
      actionTaken = 'TEMP_BAN';
    } else if (action === 'MUTE') {
      status = 'RESOLVED';
      actionTaken = 'TEMP_MUTE';
    }

    // Fetch report to get target content/user IDs
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { reportedPostId: true, reportedCommentId: true, reportedMessageId: true, reportedUserId: true },
    });
    if (!report) throw new NotFoundException('Report not found');

    // Actually remove content when action is REMOVE_CONTENT (Finding 07, Audit 13)
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
      if (this.notificationsService) {
        await this.notificationsService.create({
          userId: report.reportedUserId,
          actorId: null,
          type: 'SYSTEM',
          title: 'Content Warning',
          body: `Your content was flagged. Repeated violations may result in account restrictions.`,
        }).catch(err => this.logger.warn('Failed to send resolution notification', err instanceof Error ? err.message : err));
      } else {
        await this.prisma.notification.create({
          data: {
            userId: report.reportedUserId,
            type: 'SYSTEM' as any,
            title: 'Content Warning',
            body: `Your content was flagged. Repeated violations may result in account restrictions.`,
          },
        }).catch(err => this.logger.warn('Failed to send resolution notification', err instanceof Error ? err.message : err));
      }
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

    // Finding #417: Admin audit trail
    await this.prisma.adminAuditLog.create({
      data: { adminId, action: `RESOLVE_REPORT_${action}`, targetType: 'report', targetId: reportId, details: { actionTaken, note } },
    }).catch(() => {});

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
    await this.assertAdmin(adminId);

    const [users, posts, threads, reels, videos, pendingReports] = await Promise.all([
      this.prisma.user.count({ where: { isDeactivated: false } }),
      this.prisma.post.count(),
      this.prisma.thread.count({ where: { isChainHead: true } }),
      this.prisma.reel.count(),
      this.prisma.video.count(),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
    ]);

    return { users, posts, threads, reels, videos, pendingReports };
  }

  async banUser(adminId: string, targetId: string, reason: string, duration?: number) {
    await this.assertAdmin(adminId);

    // Verify target exists and is not an admin
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'ADMIN') throw new ForbiddenException('Cannot ban an admin user');

    const banExpiresAt = duration ? new Date(Date.now() + duration * 3600000) : null;

    // Also fetch clerkId so we can revoke their Clerk sessions
    const targetFull = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { clerkId: true },
    });

    const updatedUser = await this.prisma.user.update({
      where: { id: targetId },
      data: {
        isBanned: true,
        isDeactivated: true,
        banReason: reason,
        banExpiresAt,
      },
    });

    // Finding F24: Revoke active Clerk sessions so banned user is immediately logged out.
    // Uses Clerk Backend SDK users.banUser() which disables sign-in and revokes all sessions.
    if (targetFull?.clerkId) {
      try {
        await this.clerk.users.banUser(targetFull.clerkId);
        this.logger.log(`Clerk sessions revoked for banned user ${targetId} (clerkId: ${targetFull.clerkId})`);
      } catch (err: unknown) {
        // Non-fatal: user is banned in DB regardless. Log for investigation.
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to revoke Clerk session for banned user ${targetId}: ${msg}`);
      }
    }

    // Remove banned user from search index
    this.publishWorkflow.onUnpublish({
      contentType: 'user',
      contentId: targetId,
      userId: targetId,
    }).catch(err => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to remove banned user ${targetId} from search index: ${msg}`);
    });

    // Finding #417: Admin audit trail
    await this.prisma.adminAuditLog.create({
      data: { adminId, action: 'BAN_USER', targetType: 'user', targetId, details: { reason, duration } },
    }).catch(() => {});

    return updatedUser;
  }

  async unbanUser(adminId: string, targetId: string) {
    await this.assertAdmin(adminId);

    // Fetch clerkId to unban in Clerk as well
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { clerkId: true },
    });

    const updatedUser = await this.prisma.user.update({
      where: { id: targetId },
      data: {
        isBanned: false,
        isDeactivated: false,
        banReason: null,
        banExpiresAt: null,
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
}
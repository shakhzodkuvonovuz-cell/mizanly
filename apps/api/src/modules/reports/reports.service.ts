import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PublishWorkflowService } from '../../common/services/publish-workflow.service';
import { CreateReportDto } from './dto/create-report.dto';
import { Prisma, ReportStatus, ReportReason, ModerationAction, UserRole } from '@prisma/client';
import { createClerkClient } from '@clerk/backend';
import Redis from 'ioredis';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private clerk;

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
    private config: ConfigService,
    private notificationsService: NotificationsService,
    private publishWorkflow: PublishWorkflowService,
    @Inject('REDIS') private redis: Redis,
  ) {
    this.clerk = createClerkClient({
      secretKey: this.config.get('CLERK_SECRET_KEY'),
    });
  }

  /**
   * Report reasons that require urgent handling (Finding 2, 3, 14).
   * CSAM reports: immediately hide content + log for NCMEC CyberTipline reporting.
   * Terrorism reports: 1-hour removal target (EU TCO Regulation).
   * These high-priority categories trigger automatic content hiding pending review.
   */
  private static readonly URGENT_REPORT_REASONS: Set<string> = new Set([
    'NUDITY',      // May contain CSAM — urgent review required
    'VIOLENCE',    // May contain abhorrent violent material (AU Online Safety Act)
    'TERRORISM',   // 1-hour removal target (EU TCO Regulation)
  ]);

  // Submit a report — any user can report content
  async create(userId: string, dto: CreateReportDto) {
    // Must report at least one target
    if (!dto.reportedPostId && !dto.reportedUserId && !dto.reportedCommentId && !dto.reportedMessageId) {
      throw new BadRequestException('At least one report target (user, post, comment, or message) is required');
    }

    // Prevent users from reporting themselves
    if (dto.reportedUserId && dto.reportedUserId === userId) {
      throw new BadRequestException('You cannot report yourself');
    }

    // Check ownership of reported post/comment to prevent self-reporting own content
    if (dto.reportedPostId) {
      const post = await this.prisma.post.findUnique({
        where: { id: dto.reportedPostId },
        select: { userId: true },
      });
      if (!post) throw new NotFoundException('Reported post not found');
      if (post.userId === userId) throw new BadRequestException('You cannot report your own content');
    }
    if (dto.reportedCommentId) {
      const comment = await this.prisma.comment.findUnique({
        where: { id: dto.reportedCommentId },
        select: { userId: true },
      });
      if (!comment) throw new NotFoundException('Reported comment not found');
      if (comment.userId === userId) throw new BadRequestException('You cannot report your own content');
    }
    if (dto.reportedMessageId) {
      const message = await this.prisma.message.findUnique({
        where: { id: dto.reportedMessageId },
        select: { senderId: true },
      });
      if (!message) throw new NotFoundException('Reported message not found');
      if (message.senderId === userId) throw new BadRequestException('You cannot report your own content');
    }

    // Mass-report abuse detection: flag if user submits >10 reports in 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentReportCount = await this.prisma.report.count({
      where: { reporterId: userId, createdAt: { gte: oneHourAgo } },
    });
    if (recentReportCount >= 10) {
      this.logger.warn(`Mass-report abuse detected: user ${userId} submitted ${recentReportCount} reports in 1 hour`);
      throw new BadRequestException('You are submitting too many reports. Please try again later.');
    }

    // Build duplicate check filter — only include fields that are actually set
    const duplicateWhere: Prisma.ReportWhereInput = {
      reporterId: userId,
      status: { in: [ReportStatus.PENDING, ReportStatus.REVIEWING] },
    };
    if (dto.reportedPostId) duplicateWhere.reportedPostId = dto.reportedPostId;
    if (dto.reportedUserId) duplicateWhere.reportedUserId = dto.reportedUserId;
    if (dto.reportedCommentId) duplicateWhere.reportedCommentId = dto.reportedCommentId;
    if (dto.reportedMessageId) duplicateWhere.reportedMessageId = dto.reportedMessageId;

    const existing = await this.prisma.report.findFirst({ where: duplicateWhere });
    if (existing) throw new ConflictException('You already reported this');

    try {
      const report = await this.prisma.report.create({
        data: {
          reporterId: userId,
          reason: dto.reason,
          description: dto.description,
          reportedPostId: dto.reportedPostId,
          reportedUserId: dto.reportedUserId,
          reportedCommentId: dto.reportedCommentId,
          reportedMessageId: dto.reportedMessageId,
        },
      });

      // Urgent report handling: CSAM, terrorism, violence (Findings 2, 3, 14)
      // Auto-hide only after 3+ unique reporters to prevent weaponization (A10-#1)
      if (ReportsService.URGENT_REPORT_REASONS.has(dto.reason)) {
        this.logger.warn(
          `URGENT REPORT [${dto.reason}]: report ${report.id} from user ${userId}. ` +
          `Post: ${dto.reportedPostId || 'none'}, User: ${dto.reportedUserId || 'none'}, ` +
          `Comment: ${dto.reportedCommentId || 'none'}, Message: ${dto.reportedMessageId || 'none'}`,
        );

        // Count unique reporters for this target to prevent single-user weaponization
        const urgentTargetWhere: Prisma.ReportWhereInput = {
          reason: { in: [...ReportsService.URGENT_REPORT_REASONS] as ReportReason[] },
        };
        if (dto.reportedPostId) urgentTargetWhere.reportedPostId = dto.reportedPostId;
        if (dto.reportedCommentId) urgentTargetWhere.reportedCommentId = dto.reportedCommentId;

        const uniqueReporterCount = await this.prisma.report.groupBy({
          by: ['reporterId'],
          where: urgentTargetWhere,
        }).then(groups => groups.length);

        // Auto-hide after 3+ unique reporters (prevents single-user content takedown)
        const shouldAutoHide = uniqueReporterCount >= 3;

        if (shouldAutoHide) {
          if (dto.reportedPostId) {
            await this.prisma.post.update({
              where: { id: dto.reportedPostId },
              data: { isRemoved: true, removedReason: `Urgent report: ${dto.reason} — ${uniqueReporterCount} reporters — pending review` },
            }).catch((err: unknown) => {
              if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
                this.logger.error(`Failed to auto-hide post ${dto.reportedPostId}`, err instanceof Error ? err.message : err);
              }
            });
          }
          if (dto.reportedCommentId) {
            await this.prisma.comment.update({
              where: { id: dto.reportedCommentId },
              data: { isRemoved: true },
            }).catch((err: unknown) => {
              if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
                this.logger.error(`Failed to auto-hide comment ${dto.reportedCommentId}`, err instanceof Error ? err.message : err);
              }
            });
          }
        }

        // TODO: [LEGAL/CSAM] When reason is NUDITY with child involvement indicators:
        // 1. Preserve all evidence (do NOT delete — required by 18 USC 2258A)
        // 2. Submit CyberTipline report to NCMEC (https://report.cybertip.org/ispws/)
        // 3. Notify designated CSAM compliance officer
        // 4. Block reported user from uploading new media until review complete
        // This requires NCMEC ISP registration and API integration.

        // TODO: [LEGAL/TERRORISM] When reason is TERRORISM:
        // 1. Log timestamp for 1-hour removal compliance tracking (EU TCO Regulation)
        // 2. Integrate with GIFCT hash-sharing database for known terrorist content
        // 3. Notify admin immediately via push notification / email

        // TODO: [LEGAL/AU_ONLINE_SAFETY] For Australian users/content:
        // 1. Implement eSafety Commissioner removal notice handler (24-hour response)
        // 2. Add reporting categories: non-consensual intimate images, cyberbullying (child-specific)
        // 3. Track for BOSE transparency reporting
      }

      // Enqueue AI moderation check for reported content
      if (dto.reportedPostId) {
        const post = await this.prisma.post.findUnique({ where: { id: dto.reportedPostId }, select: { content: true } });
        if (post?.content) {
          this.queueService.addModerationJob({ content: post.content, contentType: 'post', contentId: dto.reportedPostId }).catch((err: unknown) => {
            this.logger.error(`Moderation queue failed for report on post ${dto.reportedPostId}`, err instanceof Error ? err.message : err);
          });
        }
      }

      return report;
    } catch (error) {
      // Handle P2002 (unique constraint violation) as a race-condition duplicate
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You already reported this');
      }
      throw error;
    }
  }

  // Get user's own reports (track status)
  async getMyReports(userId: string, cursor?: string, limit = 20) {
    const reports = await this.prisma.report.findMany({
      where: { reporterId: userId },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        reportedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    const hasMore = reports.length > limit;
    const data = hasMore ? reports.slice(0, limit) : reports;
    return { data, meta: { cursor: data[data.length - 1]?.id ?? null, hasMore } };
  }

  // Get single report by id (own report or admin/moderator)
  async getById(reportId: string, userId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reportedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    if (!report) throw new NotFoundException('Report not found');

    // Allow if it's the reporter's own report, or if the user is admin/moderator
    if (report.reporterId !== userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      const adminRoles: UserRole[] = ['ADMIN', 'MODERATOR'];
      if (!user || !adminRoles.includes(user.role)) {
        throw new ForbiddenException('You can only view your own reports');
      }
    }

    return report;
  }

  // Admin/Moderator: get all pending reports
  async getPending(adminId: string, cursor?: string, limit = 20) {
    await this.verifyAdminOrModerator(adminId);

    const reports = await this.prisma.report.findMany({
      where: { status: ReportStatus.PENDING },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'asc' },
      include: {
        reporter: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        reportedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    const hasMore = reports.length > limit;
    const data = hasMore ? reports.slice(0, limit) : reports;
    return { data, meta: { cursor: data[data.length - 1]?.id ?? null, hasMore } };
  }

  // Admin/Moderator: resolve a report
  async resolve(reportId: string, adminId: string, actionTaken: ModerationAction) {
    await this.verifyAdminOrModerator(adminId);

    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== ReportStatus.PENDING && report.status !== ReportStatus.REVIEWING) {
      throw new BadRequestException('Report already resolved or dismissed');
    }

    // Build transaction operations
    const ops: any[] = [
      this.prisma.report.update({
        where: { id: reportId },
        data: {
          status: ReportStatus.RESOLVED,
          actionTaken,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.moderationLog.create({
        data: {
          moderatorId: adminId,
          action: actionTaken,
          targetUserId: report.reportedUserId,
          targetPostId: report.reportedPostId,
          targetCommentId: report.reportedCommentId,
          targetMessageId: report.reportedMessageId,
          reportId: report.id,
          reason: `Report ${reportId}: ${report.reason}`,
          explanation: `Resolved report ${reportId} with action: ${actionTaken}`,
        },
      }),
    ];

    // Actually remove content when action is CONTENT_REMOVED (Finding 07, Audit 13)
    if (actionTaken === ModerationAction.CONTENT_REMOVED) {
      if (report.reportedPostId) {
        ops.push(this.prisma.post.update({ where: { id: report.reportedPostId }, data: { isRemoved: true } }));
      }
      if (report.reportedCommentId) {
        ops.push(this.prisma.comment.update({ where: { id: report.reportedCommentId }, data: { isRemoved: true } }));
      }
      if (report.reportedMessageId) {
        ops.push(this.prisma.message.update({ where: { id: report.reportedMessageId }, data: { isDeleted: true } }));
      }
    }

    // Actually ban user when action is PERMANENT_BAN or TEMP_BAN
    // Match admin.service.ts pattern: set both isBanned + isDeactivated, then revoke Clerk sessions
    if ((actionTaken === ModerationAction.PERMANENT_BAN || actionTaken === ModerationAction.TEMP_BAN) && report.reportedUserId) {
      ops.push(this.prisma.user.update({
        where: { id: report.reportedUserId },
        data: { isBanned: true, isDeactivated: true, banReason: `Report ${reportId}: ${report.reason}` },
      }));
    }

    // Mute user when action is TEMP_MUTE — increment warningsCount as indicator
    if (actionTaken === ModerationAction.TEMP_MUTE && report.reportedUserId) {
      ops.push(this.prisma.user.update({
        where: { id: report.reportedUserId },
        data: { warningsCount: { increment: 1 } },
      }));
    }

    const [updated] = await this.prisma.$transaction(ops);

    // Revoke Clerk sessions so banned user is immediately logged out (matching admin.service.ts pattern)
    if ((actionTaken === ModerationAction.PERMANENT_BAN || actionTaken === ModerationAction.TEMP_BAN) && report.reportedUserId) {
      const bannedUser = await this.prisma.user.findUnique({
        where: { id: report.reportedUserId },
        select: { clerkId: true },
      });
      if (bannedUser?.clerkId) {
        try {
          await this.clerk.users.banUser(bannedUser.clerkId);
          this.logger.log(`Clerk sessions revoked for banned user ${report.reportedUserId} (clerkId: ${bannedUser.clerkId})`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Failed to revoke Clerk session for banned user ${report.reportedUserId}: ${msg}`);
        }
      }
      // Force-disconnect any active WebSocket connections for the banned user
      this.redis.publish('user:banned', JSON.stringify({ userId: report.reportedUserId }))
        .catch(err => this.logger.warn('Failed to publish ban disconnect', err instanceof Error ? err.message : err));

      // Remove banned user + their content from Meilisearch search index
      this.publishWorkflow.onUnpublish({ contentType: 'user', contentId: report.reportedUserId, userId: report.reportedUserId })
        .catch(err => this.logger.warn(`Failed to remove banned user from search: ${err instanceof Error ? err.message : err}`));
      // Also remove their content from search indexes
      const userContent = await this.prisma.post.findMany({ where: { userId: report.reportedUserId }, select: { id: true }, take: 1000 });
      for (const post of userContent) {
        this.queueService.addSearchIndexJob({ action: 'delete', indexName: 'posts', documentId: post.id }).catch(() => {});
      }
      const userReels = await this.prisma.reel.findMany({ where: { userId: report.reportedUserId }, select: { id: true }, take: 1000 });
      for (const reel of userReels) {
        this.queueService.addSearchIndexJob({ action: 'delete', indexName: 'reels', documentId: reel.id }).catch(() => {});
      }
      const userThreads = await this.prisma.thread.findMany({ where: { userId: report.reportedUserId }, select: { id: true }, take: 1000 });
      for (const thread of userThreads) {
        this.queueService.addSearchIndexJob({ action: 'delete', indexName: 'threads', documentId: thread.id }).catch(() => {});
      }
    }

    // Finding 30 (Audit 13): Handle WARNING action — notify the reported user
    // Sent after transaction succeeds, routed through NotificationsService for push + dedup
    if (actionTaken === ModerationAction.WARNING && report.reportedUserId) {
      this.notificationsService.create({
        userId: report.reportedUserId,
        actorId: null,
        type: 'SYSTEM',
        title: 'Content Warning',
        body: `Your content was flagged for ${report.reason}. Repeated violations may result in account restrictions.`,
      }).catch(err => this.logger.warn('Failed to send warning notification', err instanceof Error ? err.message : err));
    }

    return updated;
  }

  // Admin/Moderator: dismiss a report
  async dismiss(reportId: string, adminId: string) {
    await this.verifyAdminOrModerator(adminId);

    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== ReportStatus.PENDING && report.status !== ReportStatus.REVIEWING) {
      throw new BadRequestException('Report already resolved or dismissed');
    }

    // If the report was urgent and triggered auto-hide, restore the content on dismiss (A10-#2)
    if (ReportsService.URGENT_REPORT_REASONS.has(report.reason as string)) {
      // Only restore if no OTHER unresolved urgent reports exist for the same target
      const otherUrgentReports = await this.prisma.report.count({
        where: {
          id: { not: reportId },
          status: { in: [ReportStatus.PENDING, ReportStatus.REVIEWING] },
          reason: { in: [...ReportsService.URGENT_REPORT_REASONS] as ReportReason[] },
          ...(report.reportedPostId ? { reportedPostId: report.reportedPostId } : {}),
          ...(report.reportedCommentId ? { reportedCommentId: report.reportedCommentId } : {}),
        },
      });

      if (otherUrgentReports === 0) {
        if (report.reportedPostId) {
          await this.prisma.post.update({
            where: { id: report.reportedPostId },
            data: { isRemoved: false, removedReason: null },
          }).catch((err: unknown) => {
            this.logger.warn(`Failed to restore post ${report.reportedPostId} on dismiss`, err instanceof Error ? err.message : err);
          });
        }
        if (report.reportedCommentId) {
          await this.prisma.comment.update({
            where: { id: report.reportedCommentId },
            data: { isRemoved: false },
          }).catch((err: unknown) => {
            this.logger.warn(`Failed to restore comment ${report.reportedCommentId} on dismiss`, err instanceof Error ? err.message : err);
          });
        }
      }
    }

    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.DISMISSED,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });
  }

  // Admin/Moderator: get report stats
  async getStats(adminId: string) {
    await this.verifyAdminOrModerator(adminId);

    const [pending, reviewing, resolved, dismissed] = await Promise.all([
      this.prisma.report.count({ where: { status: ReportStatus.PENDING } }),
      this.prisma.report.count({ where: { status: ReportStatus.REVIEWING } }),
      this.prisma.report.count({ where: { status: ReportStatus.RESOLVED } }),
      this.prisma.report.count({ where: { status: ReportStatus.DISMISSED } }),
    ]);
    return { pending, reviewing, resolved, dismissed, total: pending + reviewing + resolved + dismissed };
  }

  /** Verify the user is an ADMIN or MODERATOR */
  private async verifyAdminOrModerator(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) {
      throw new ForbiddenException('Admin or moderator access required');
    }
    const allowedRoles: UserRole[] = ['ADMIN', 'MODERATOR'];
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException('Admin or moderator access required');
    }
  }
}
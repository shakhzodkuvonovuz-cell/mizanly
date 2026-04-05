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
    // F3-3 FIX: Include thread/reel/video in the validation (they exist in DTO and are handled below)
    if (!dto.reportedPostId && !dto.reportedUserId && !dto.reportedCommentId &&
        !dto.reportedMessageId && !dto.reportedThreadId && !dto.reportedReelId && !dto.reportedVideoId) {
      throw new BadRequestException('At least one report target is required');
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
    // P2-2.1: Ownership checks for thread/reel/video
    if (dto.reportedThreadId) {
      const thread = await this.prisma.thread.findUnique({
        where: { id: dto.reportedThreadId },
        select: { userId: true },
      });
      if (!thread) throw new NotFoundException('Reported thread not found');
      if (thread.userId === userId) throw new BadRequestException('You cannot report your own content');
    }
    if (dto.reportedReelId) {
      const reel = await this.prisma.reel.findUnique({
        where: { id: dto.reportedReelId },
        select: { userId: true },
      });
      if (!reel) throw new NotFoundException('Reported reel not found');
      if (reel.userId === userId) throw new BadRequestException('You cannot report your own content');
    }
    if (dto.reportedVideoId) {
      const video = await this.prisma.video.findUnique({
        where: { id: dto.reportedVideoId },
        select: { userId: true },
      });
      if (!video) throw new NotFoundException('Reported video not found');
      if (video.userId === userId) throw new BadRequestException('You cannot report your own content');
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
    if (dto.reportedThreadId) duplicateWhere.reportedThreadId = dto.reportedThreadId;
    if (dto.reportedReelId) duplicateWhere.reportedReelId = dto.reportedReelId;
    if (dto.reportedVideoId) duplicateWhere.reportedVideoId = dto.reportedVideoId;

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
          reportedThreadId: dto.reportedThreadId,
          reportedReelId: dto.reportedReelId,
          reportedVideoId: dto.reportedVideoId,
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
        if (dto.reportedThreadId) urgentTargetWhere.reportedThreadId = dto.reportedThreadId;
        if (dto.reportedReelId) urgentTargetWhere.reportedReelId = dto.reportedReelId;
        if (dto.reportedVideoId) urgentTargetWhere.reportedVideoId = dto.reportedVideoId;

        const uniqueReporterCount = await this.prisma.report.groupBy({
          by: ['reporterId'],
          where: urgentTargetWhere,
        }).then(groups => groups.length);

        // Auto-hide after 3+ unique reporters (prevents single-user content takedown)
        const shouldAutoHide = uniqueReporterCount >= 3;

        if (shouldAutoHide) {
          const hideReason = `Urgent report: ${dto.reason} — ${uniqueReporterCount} reporters — pending review`;
          if (dto.reportedPostId) {
            await this.prisma.post.update({
              where: { id: dto.reportedPostId },
              data: { isRemoved: true, removedReason: hideReason },
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
          // X08-#23: Auto-hide thread/reel/video on urgent reports (not just post/comment)
          if (report.reportedThreadId) {
            await this.prisma.thread.update({
              where: { id: report.reportedThreadId },
              data: { isRemoved: true },
            }).catch((err: unknown) => {
              if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
                this.logger.error(`Failed to auto-hide thread ${report.reportedThreadId}`, err instanceof Error ? err.message : err);
              }
            });
          }
          if (report.reportedReelId) {
            await this.prisma.reel.update({
              where: { id: report.reportedReelId },
              data: { isRemoved: true },
            }).catch((err: unknown) => {
              if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
                this.logger.error(`Failed to auto-hide reel ${report.reportedReelId}`, err instanceof Error ? err.message : err);
              }
            });
          }
          if (report.reportedVideoId) {
            await this.prisma.video.update({
              where: { id: report.reportedVideoId },
              data: { isRemoved: true },
            }).catch((err: unknown) => {
              if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
                this.logger.error(`Failed to auto-hide video ${report.reportedVideoId}`, err instanceof Error ? err.message : err);
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

      // A10-#17: Return only safe fields, not full schema
      return { id: report.id, status: report.status, createdAt: report.createdAt };
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
    // A10-#10 / B11-#17: Type properly instead of any[]
    const ops: Prisma.PrismaPromise<unknown>[] = [
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

    // X08-#2 FIX: Handle ALL content types including thread/reel/video
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
      if (report.reportedThreadId) {
        ops.push(this.prisma.thread.update({ where: { id: report.reportedThreadId }, data: { isRemoved: true } }));
      }
      if (report.reportedReelId) {
        ops.push(this.prisma.reel.update({ where: { id: report.reportedReelId }, data: { isRemoved: true } }));
      }
      if (report.reportedVideoId) {
        ops.push(this.prisma.video.update({ where: { id: report.reportedVideoId }, data: { isRemoved: true } }));
      }
    }

    // Actually ban user when action is PERMANENT_BAN or TEMP_BAN
    // Match admin.service.ts pattern: set both isBanned + isDeactivated, then revoke Clerk sessions
    if ((actionTaken === ModerationAction.PERMANENT_BAN || actionTaken === ModerationAction.TEMP_BAN) && report.reportedUserId) {
      // X04-#3 FIX: Set banExpiresAt for TEMP_BAN (72h) so auth guard auto-unban works
      const banExpiresAt = actionTaken === ModerationAction.TEMP_BAN
        ? new Date(Date.now() + 72 * 3600000) // 72 hours
        : null;
      ops.push(this.prisma.user.update({
        where: { id: report.reportedUserId },
        data: { isBanned: true, isDeactivated: true, banReason: `Report ${reportId}: ${report.reason}`, banExpiresAt },
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
      // A10-#14 / B11-#18: Remove all content from search with cursor pagination (no cap)
      // and log errors instead of silently swallowing
      for (const contentType of ['post', 'reel', 'thread', 'video'] as const) {
        const model = contentType === 'post' ? this.prisma.post
          : contentType === 'reel' ? this.prisma.reel
          : contentType === 'video' ? this.prisma.video
          : this.prisma.thread;
        const indexName = `${contentType}s`;
        let deindexCursor: string | undefined;
        let deindexed = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const items = await (model as { findMany: (args: unknown) => Promise<Array<{ id: string }>> }).findMany({
            where: { userId: report.reportedUserId },
            select: { id: true },
            take: 500,
            ...(deindexCursor ? { cursor: { id: deindexCursor }, skip: 1 } : {}),
            orderBy: { id: 'asc' as const },
          });
          if (items.length === 0) break;
          deindexCursor = items[items.length - 1].id;
          for (const item of items) {
            this.queueService.addSearchIndexJob({ action: 'delete', indexName, documentId: item.id })
              .catch((err: unknown) => this.logger.warn(`Deindex failed for ${contentType} ${item.id}`, err instanceof Error ? err.message : err));
          }
          deindexed += items.length;
          if (items.length < 500) break;
        }
        if (deindexed > 0) this.logger.log(`Deindexed ${deindexed} ${contentType}s for banned user ${report.reportedUserId}`);
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
      // F3-4 FIX: Include thread/reel/video in the "other urgent reports" check
      const otherUrgentReports = await this.prisma.report.count({
        where: {
          id: { not: reportId },
          status: { in: [ReportStatus.PENDING, ReportStatus.REVIEWING] },
          reason: { in: [...ReportsService.URGENT_REPORT_REASONS] as ReportReason[] },
          ...(report.reportedPostId ? { reportedPostId: report.reportedPostId } : {}),
          ...(report.reportedCommentId ? { reportedCommentId: report.reportedCommentId } : {}),
          ...(report.reportedThreadId ? { reportedThreadId: report.reportedThreadId } : {}),
          ...(report.reportedReelId ? { reportedReelId: report.reportedReelId } : {}),
          ...(report.reportedVideoId ? { reportedVideoId: report.reportedVideoId } : {}),
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
        // F3-4 FIX: Restore threads, reels, and videos that were auto-hidden by urgent reports
        if (report.reportedThreadId) {
          await this.prisma.thread.update({
            where: { id: report.reportedThreadId },
            data: { isRemoved: false },
          }).catch((err: unknown) => {
            this.logger.warn(`Failed to restore thread ${report.reportedThreadId} on dismiss`, err instanceof Error ? err.message : err);
          });
        }
        if (report.reportedReelId) {
          await this.prisma.reel.update({
            where: { id: report.reportedReelId },
            data: { isRemoved: false },
          }).catch((err: unknown) => {
            this.logger.warn(`Failed to restore reel ${report.reportedReelId} on dismiss`, err instanceof Error ? err.message : err);
          });
        }
        if (report.reportedVideoId) {
          await this.prisma.video.update({
            where: { id: report.reportedVideoId },
            data: { isRemoved: false },
          }).catch((err: unknown) => {
            this.logger.warn(`Failed to restore video ${report.reportedVideoId} on dismiss`, err instanceof Error ? err.message : err);
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
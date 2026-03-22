import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { CreateReportDto } from './dto/create-report.dto';
import { Prisma, ReportStatus, ModerationAction, UserRole } from '@prisma/client';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
  ) {}

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
      // Immediately hide reported content pending manual review
      if (ReportsService.URGENT_REPORT_REASONS.has(dto.reason)) {
        this.logger.warn(
          `URGENT REPORT [${dto.reason}]: report ${report.id} from user ${userId}. ` +
          `Post: ${dto.reportedPostId || 'none'}, User: ${dto.reportedUserId || 'none'}, ` +
          `Comment: ${dto.reportedCommentId || 'none'}, Message: ${dto.reportedMessageId || 'none'}`,
        );

        // Auto-hide content pending review — fail-closed for legal safety
        if (dto.reportedPostId) {
          await this.prisma.post.update({
            where: { id: dto.reportedPostId },
            data: { isRemoved: true, removedReason: `Urgent report: ${dto.reason} — pending review` },
          }).catch(() => { /* post may already be removed */ });
        }
        if (dto.reportedCommentId) {
          await this.prisma.comment.update({
            where: { id: dto.reportedCommentId },
            data: { isRemoved: true },
          }).catch(() => { /* comment may already be removed */ });
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

    // Actually remove content when action is CONTENT_REMOVED
    if (actionTaken === ModerationAction.CONTENT_REMOVED) {
      if (report.reportedPostId) {
        ops.push(this.prisma.post.update({ where: { id: report.reportedPostId }, data: { isRemoved: true } }));
      }
      if (report.reportedCommentId) {
        ops.push(this.prisma.comment.update({ where: { id: report.reportedCommentId }, data: { isRemoved: true } }));
      }
    }

    // Actually ban user when action is PERMANENT_BAN or TEMP_BAN
    if ((actionTaken === ModerationAction.PERMANENT_BAN || actionTaken === ModerationAction.TEMP_BAN) && report.reportedUserId) {
      ops.push(this.prisma.user.update({
        where: { id: report.reportedUserId },
        data: { isBanned: true, banReason: `Report ${reportId}: ${report.reason}` },
      }));
    }

    // Mute user when action is TEMP_MUTE
    if (actionTaken === ModerationAction.TEMP_MUTE && report.reportedUserId) {
      ops.push(this.prisma.user.update({
        where: { id: report.reportedUserId },
        data: { isMuted: true },
      }));
    }

    const [updated] = await this.prisma.$transaction(ops);
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
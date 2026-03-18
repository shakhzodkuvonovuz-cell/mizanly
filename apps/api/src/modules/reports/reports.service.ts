import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { Prisma, ReportStatus, ModerationAction, UserRole } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

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
      return await this.prisma.report.create({
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

    const [updated] = await this.prisma.$transaction([
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
    ]);
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
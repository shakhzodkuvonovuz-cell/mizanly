import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportStatus, ModerationAction } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // Submit a report — any user can report content
  async create(userId: string, dto: CreateReportDto) {
    // Prevent duplicate reports from same user on same target
    const existing = await this.prisma.report.findFirst({
      where: {
        reporterId: userId,
        ...(dto.reportedPostId && { reportedPostId: dto.reportedPostId }),
        ...(dto.reportedUserId && { reportedUserId: dto.reportedUserId }),
        ...(dto.reportedCommentId && { reportedCommentId: dto.reportedCommentId }),
        ...(dto.reportedMessageId && { reportedMessageId: dto.reportedMessageId }),
        status: { in: [ReportStatus.PENDING, ReportStatus.REVIEWING] },
      },
    });
    if (existing) throw new ConflictException('You already reported this');

    return this.prisma.report.create({
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
  }

  // Get user's own reports (track status)
  async getMyReports(userId: string, cursor?: string, limit = 20) {
    const reports = await this.prisma.report.findMany({
      where: { reporterId: userId },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        reportedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    const hasMore = reports.length > limit;
    const data = hasMore ? reports.slice(0, limit) : reports;
    return { data, meta: { cursor: data[data.length - 1]?.id ?? null, hasMore } };
  }

  // Get single report by id (own report only)
  async getById(reportId: string, userId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reportedUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    if (!report) throw new NotFoundException('Report not found');
    if (report.reporterId !== userId) throw new ForbiddenException();
    return report;
  }

  // Admin: get all pending reports
  async getPending(cursor?: string, limit = 20) {
    const reports = await this.prisma.report.findMany({
      where: { status: ReportStatus.PENDING },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
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

  // Admin: resolve a report
  async resolve(reportId: string, adminId: string, actionTaken: ModerationAction) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    const [updated] = await this.prisma.$transaction([
      this.prisma.report.update({
        where: { id: reportId },
        data: { status: ReportStatus.RESOLVED, actionTaken, reviewedAt: new Date() },
      }),
      this.prisma.moderationLog.create({
        data: {
          moderatorId: adminId,
          action: actionTaken,
          targetUserId: report.reportedUserId,
          targetPostId: report.reportedPostId,
          reason: `Report ${reportId}: ${report.reason}`,
          explanation: `Resolved report ${reportId} with action: ${actionTaken}`,
        },
      }),
    ]);
    return updated;
  }

  // Admin: dismiss a report
  async dismiss(reportId: string) {
    return this.prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.DISMISSED, reviewedAt: new Date() },
    });
  }

  // Admin: get report stats
  async getStats() {
    const [pending, reviewing, resolved, dismissed] = await Promise.all([
      this.prisma.report.count({ where: { status: ReportStatus.PENDING } }),
      this.prisma.report.count({ where: { status: ReportStatus.REVIEWING } }),
      this.prisma.report.count({ where: { status: ReportStatus.RESOLVED } }),
      this.prisma.report.count({ where: { status: ReportStatus.DISMISSED } }),
    ]);
    return { pending, reviewing, resolved, dismissed, total: pending + reviewing + resolved + dismissed };
  }
}
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ReportStatus, ModerationAction } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  private async assertAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
  }

  async getReports(adminId: string, status?: string, cursor?: string, limit = 20) {
    await this.assertAdmin(adminId);

    const where: any = {};
    if (status) where.status = status;
    if (cursor) where.createdAt = { lt: new Date(cursor) };

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
    });

    const hasMore = reports.length > limit;
    const result = hasMore ? reports.slice(0, limit) : reports;

    return {
      data: result,
      meta: {
        cursor: hasMore ? result[result.length - 1].createdAt.toISOString() : null,
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
    }

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

    const banExpiresAt = duration ? new Date(Date.now() + duration * 3600000) : null;

    return this.prisma.user.update({
      where: { id: targetId },
      data: {
        isDeactivated: true,
        banReason: reason,
        banExpiresAt,
      },
    });
  }

  async unbanUser(adminId: string, targetId: string) {
    await this.assertAdmin(adminId);

    return this.prisma.user.update({
      where: { id: targetId },
      data: {
        isDeactivated: false,
        banReason: null,
        banExpiresAt: null,
      },
    });
  }
}
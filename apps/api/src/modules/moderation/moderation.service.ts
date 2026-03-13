import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ReportReason, ReportStatus, ModerationAction } from '@prisma/client';
import { checkText, TextCheckResult } from './word-filter';

export interface CheckTextDto {
  text: string;
  context?: 'post' | 'comment' | 'message' | 'profile';
}

export interface CheckImageDto {
  imageUrl: string;
}

export interface ReviewActionDto {
  action: 'approve' | 'remove' | 'warn';
  note?: string;
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(private prisma: PrismaService) {}

  async checkText(userId: string, dto: CheckTextDto): Promise<TextCheckResult> {
    // Run word filter
    const result = checkText(dto.text);

    // If flagged, automatically create a moderation report
    if (result.flagged) {
      await this.flagContent({
        reporterId: userId,
        text: dto.text,
        context: dto.context,
        categories: result.categories,
        severity: result.severity,
        matches: result.matches,
        autoFlagged: true,
      });

      // Auto-action on high severity: hide content immediately (simulate)
      if (result.severity === 'high') {
        // In a real system, we would hide the content and notify user
        this.logger.warn(`High severity content flagged from user ${userId}, auto-action recommended`);
      }
    }

    return result;
  }

  async checkImage(userId: string, dto: CheckImageDto): Promise<{ safe: boolean; categories?: string[] }> {
    // Placeholder for image moderation
    // In production, integrate with AWS Rekognition, Google Vision, etc.
    // For now, return safe: true
    return { safe: true };
  }

  async flagContent(data: {
    reporterId: string;
    text?: string;
    context?: string;
    categories: string[];
    severity: string;
    matches: string[];
    autoFlagged?: boolean;
    reportedUserId?: string;
    reportedPostId?: string;
    reportedCommentId?: string;
    reportedMessageId?: string;
  }) {
    // Map first category to ReportReason
    const reason = this.mapCategoryToReason(data.categories[0]);

    const description = JSON.stringify({
      flaggedText: data.text,
      context: data.context,
      categories: data.categories,
      severity: data.severity,
      matches: data.matches,
      autoFlagged: data.autoFlagged ?? false,
    });

    await this.prisma.report.create({
      data: {
        reporterId: data.reporterId,
        reportedUserId: data.reportedUserId,
        reportedPostId: data.reportedPostId,
        reportedCommentId: data.reportedCommentId,
        reportedMessageId: data.reportedMessageId,
        reason,
        description,
        status: 'PENDING',
        actionTaken: 'NONE',
      },
    });
  }

  async getQueue(adminId: string, cursor?: string) {
    // Verify admin
    await this.verifyAdmin(adminId);

    const limit = 20;
    const reports = await this.prisma.report.findMany({
      where: { status: 'PENDING' },
      include: {
        reporter: { select: { id: true, displayName: true } },
        reportedUser: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
    });

    const hasMore = reports.length > limit;
    const data = reports.slice(0, limit);
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data,
      meta: { cursor: nextCursor, hasMore },
    };
  }

  async review(adminId: string, reportId: string, action: 'approve' | 'remove' | 'warn', note?: string) {
    await this.verifyAdmin(adminId);

    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== 'PENDING') throw new BadRequestException('Report already reviewed');

    let status: ReportStatus = 'RESOLVED';
    let actionTaken: ModerationAction = 'NONE';

    switch (action) {
      case 'approve':
        status = 'DISMISSED';
        actionTaken = 'NONE';
        break;
      case 'remove':
        status = 'RESOLVED';
        actionTaken = 'CONTENT_REMOVED';
        // In real system, would hide content and possibly notify user
        break;
      case 'warn':
        status = 'RESOLVED';
        actionTaken = 'WARNING';
        // Send warning to user
        break;
    }

    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        reviewedById: adminId,
        reviewedAt: new Date(),
        actionTaken,
        moderatorNotes: note,
      },
    });
  }

  async getStats(adminId: string) {
    await this.verifyAdmin(adminId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      flaggedToday,
      reviewedToday,
      totalPending,
      autoFlagged,
      falsePositives,
    ] = await Promise.all([
      this.prisma.report.count({
        where: { createdAt: { gte: today } },
      }),
      this.prisma.report.count({
        where: { reviewedAt: { gte: today } },
      }),
      this.prisma.report.count({
        where: { status: 'PENDING' },
      }),
      this.prisma.report.count({
        where: {
          description: { contains: '"autoFlagged":true' },
        },
      }),
      this.prisma.report.count({
        where: {
          actionTaken: 'NONE',
          status: 'DISMISSED',
        },
      }),
    ]);

    return {
      flaggedToday,
      reviewedToday,
      totalPending,
      autoFlagged,
      falsePositives,
    };
  }

  private async verifyAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
  }

  private mapCategoryToReason(category: string): ReportReason {
    switch (category) {
      case 'hate_speech':
        return 'HATE_SPEECH';
      case 'spam':
        return 'SPAM';
      case 'nsfw_text':
        return 'NUDITY';
      case 'harassment':
        return 'HARASSMENT';
      case 'self_harm':
        return 'SELF_HARM';
      default:
        return 'OTHER';
    }
  }
}
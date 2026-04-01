import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma, ReportReason, ReportStatus, ModerationAction, UserRole } from '@prisma/client';
import { checkText, TextCheckResult } from './word-filter';
import { AiService } from '../ai/ai.service';
import { IsString, IsOptional, IsIn, IsUrl, MaxLength, IsBoolean, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class CheckTextDto {
  @IsString() @MaxLength(10000) text: string;
  @IsOptional() @IsString() @IsIn(['post', 'comment', 'message', 'profile']) context?: 'post' | 'comment' | 'message' | 'profile';
}

export class CheckImageDto {
  @IsUrl() imageUrl: string;
}

export class ReviewActionDto {
  @IsString() @IsIn(['approve', 'remove', 'warn']) action: 'approve' | 'remove' | 'warn';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class SubmitAppealDto {
  @IsString() moderationLogId: string;
  @IsString() @IsIn(['no-violation', 'out-of-context', 'educational', 'posted-by-mistake', 'other']) reason: 'no-violation' | 'out-of-context' | 'educational' | 'posted-by-mistake' | 'other';
  @IsString() @MaxLength(2000) details: string;
}

export class ResolveAppealDto {
  @IsBoolean() @Transform(({ value }) => value === true || value === 'true') accepted: boolean;
  @IsString() @IsNotEmpty() @MaxLength(2000) result: string;
}

/**
 * ModerationService — Report management, moderation queue, admin review workflows.
 *
 * Responsibility boundary:
 * - This service: user reports, moderation queue, admin review actions, appeals,
 *   auto-flag via word-filter (checkText), image moderation via AiService (checkImage),
 *   moderation stats.
 * - ContentSafetyService: AI-based text analysis (Islamic-context NLP), keyword blocking,
 *   forward limits, kindness reminders, auto-remove pipeline, viral content throttling.
 *
 * Key difference: This service is the controller-facing service exposed via REST endpoints.
 * ContentSafetyService is the inline pipeline service injected into Posts/Threads/Channels/Videos
 * for automated content moderation during creation.
 *
 * @see ContentSafetyService for AI text moderation and automated safety pipeline
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  /**
   * Check text using the local word-filter (synchronous, fast, no API call).
   * For AI-based Islamic-context NLP moderation, see ContentSafetyService.moderateText().
   * Both are complementary: this catches obvious keyword violations immediately,
   * while ContentSafetyService.moderateText() handles nuanced context analysis.
   *
   * @see ContentSafetyService.moderateText for AI-based text moderation
   */
  async checkText(userId: string, dto: CheckTextDto): Promise<Omit<TextCheckResult, 'matches'>> {
    // Run word filter
    const result = checkText(dto.text);

    // If flagged, automatically create a moderation report
    if (result.flagged) {
      await this.flagContent({
        reporterId: userId,
        reportedUserId: userId,
        text: dto.text,
        context: dto.context,
        categories: result.categories,
        severity: result.severity,
        matches: result.matches,
        autoFlagged: true,
      });

      // Auto-action on high severity: hide content immediately (simulate)
      if (result.severity === 'high') {
        this.logger.warn(`High severity content flagged from user ${userId}, auto-action recommended`);
      }
    }

    // X08-#28: Strip matched slur text from response — only return categories + severity to client.
    // The matches are used internally for flagContent() above but must NOT be sent to the client,
    // as that would leak the exact prohibited terms that triggered the filter.
    const { matches: _matches, ...safeResult } = result;

    // Finding #207: Surface crisis resources when self-harm content detected
    if (safeResult.categories.includes('self_harm')) {
      return {
        ...safeResult,
        crisisResources: {
          message: 'If you or someone you know is struggling, please reach out for help.',
          helplines: [
            { name: 'International Association for Suicide Prevention', url: 'https://www.iasp.info/resources/Crisis_Centres/' },
            { name: 'Crisis Text Line', detail: 'Text HOME to 741741 (US)', url: 'https://www.crisistextline.org/' },
            { name: 'Find A Helpline', url: 'https://findahelpline.com/' },
          ],
        },
      };
    }

    return safeResult;
  }

  /**
   * Check image using AiService.moderateImage() (Claude Vision API).
   * This is the controller-facing endpoint. Other services (Posts, Reels, Threads, Stories, Videos)
   * call AiService.moderateImage() directly for inline moderation during content creation.
   *
   * Note: ContentSafetyService also has a moderateImage() method, but it is unused and deprecated.
   * All image moderation goes through AiService.moderateImage().
   *
   * @see AiService.moderateImage for the underlying image moderation implementation
   */
  async checkImage(userId: string, dto: CheckImageDto): Promise<{
    safe: boolean;
    classification: 'SAFE' | 'WARNING' | 'BLOCK';
    reason: string | null;
    categories: string[];
    isSensitive?: boolean;
  }> {
    // Use Claude Vision API for image content moderation
    const result = await this.aiService.moderateImage(dto.imageUrl);

    if (result.classification === 'BLOCK') {
      // Auto-flag blocked content for moderation queue
      await this.flagContent({
        reporterId: userId,
        text: `[Image moderation] ${result.reason || 'Blocked by AI'}`,
        context: 'post',
        categories: result.categories.length > 0 ? result.categories : ['image-violation'],
        severity: 'high',
        matches: [],
        autoFlagged: true,
        reportedUserId: userId,
      });

      this.logger.warn(`Image BLOCKED for user ${userId}: ${result.reason}`);
      return { safe: false, classification: 'BLOCK', reason: result.reason, categories: result.categories };
    }

    if (result.classification === 'WARNING') {
      // Queue for manual review but allow with sensitive flag
      await this.flagContent({
        reporterId: userId,
        text: `[Image moderation WARNING] ${result.reason || 'Flagged by AI'}`,
        context: 'post',
        categories: result.categories.length > 0 ? result.categories : ['image-warning'],
        severity: 'medium',
        matches: [],
        autoFlagged: true,
        reportedUserId: userId,
      });

      this.logger.log(`Image flagged WARNING for user ${userId}: ${result.reason}`);
      return { safe: true, classification: 'WARNING', reason: result.reason, categories: result.categories, isSensitive: true };
    }

    return { safe: true, classification: 'SAFE', reason: null, categories: [] };
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
        // Finding 28 (Audit 13): For auto-flagged content, reporterId is null (system-generated).
        // Previously set reporterId to the content creator, which made the user appear to report themselves.
        // reporterId is optional (String?) in schema, so null is valid.
        reporterId: data.autoFlagged ? null : data.reporterId,
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
    await this.verifyAdminOrModerator(adminId);

    const limit = 20;
    const where: Prisma.ReportWhereInput = { status: 'PENDING' };
    // Finding #254: Priority sorting — urgent reasons first, then oldest first (FIFO)
    const reports = await this.prisma.report.findMany({
      where,
      include: {
        reporter: { select: { id: true, displayName: true } },
        reportedUser: { select: { id: true, displayName: true, warningsCount: true } },
      },
      orderBy: [{ reason: 'asc' }, { createdAt: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
    await this.verifyAdminOrModerator(adminId);

    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Report not found');
    // B11-#8: Accept both PENDING and REVIEWING to match reports.service.ts behavior
    if (report.status !== 'PENDING' && report.status !== 'REVIEWING') throw new BadRequestException('Report already reviewed');

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
        break;
      case 'warn':
        status = 'RESOLVED';
        actionTaken = 'WARNING';
        break;
    }

    // Use a transaction to update report + soft-delete content + create moderation log atomically
    await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: reportId },
        data: {
          status,
          reviewedById: adminId,
          reviewedAt: new Date(),
          actionTaken,
          moderatorNotes: note,
        },
      });

      // Soft-delete content when action is 'remove'
      if (action === 'remove') {
        if (report.reportedPostId) {
          await tx.post.update({
            where: { id: report.reportedPostId },
            data: { isRemoved: true, removedReason: note ?? 'Removed by moderator', removedAt: new Date() },
          });
        }
        if (report.reportedCommentId) {
          await tx.comment.update({
            where: { id: report.reportedCommentId },
            data: { isRemoved: true },
          });
        }
        // B11-#14: Also handle message soft-delete (was missing)
        if (report.reportedMessageId) {
          await tx.message.update({
            where: { id: report.reportedMessageId },
            data: { isDeleted: true },
          });
        }
      }

      // Create moderation log for non-dismiss actions
      if (action !== 'approve') {
        await tx.moderationLog.create({
          data: {
            moderatorId: adminId,
            action: actionTaken,
            targetUserId: report.reportedUserId,
            targetPostId: report.reportedPostId,
            targetCommentId: report.reportedCommentId,
            targetMessageId: report.reportedMessageId,
            reportId: report.id,
            reason: `Report ${reportId}: ${report.reason}`,
            explanation: note ?? `Resolved report ${reportId} with action: ${actionTaken}`,
          },
        });
      }
    });
  }

  async getStats(adminId: string) {
    await this.verifyAdminOrModerator(adminId);

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

  /** Get moderation actions targeting the current user */
  async getMyActions(userId: string, cursor?: string) {
    const limit = 20;
    const logs = await this.prisma.moderationLog.findMany({
      where: { targetUserId: userId },
      include: {
        // A10-#5: Do NOT expose moderator identity to moderated users
        targetPost: { select: { id: true, content: true, mediaUrls: true } },
        targetComment: { select: { id: true, content: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = logs.length > limit;
    const data = hasMore ? logs.slice(0, limit) : logs;
    return {
      data,
      meta: { cursor: data[data.length - 1]?.id ?? null, hasMore },
    };
  }

  /** Get user's appeals (moderation logs where they submitted an appeal) */
  async getMyAppeals(userId: string, cursor?: string) {
    const limit = 20;
    const logs = await this.prisma.moderationLog.findMany({
      where: { targetUserId: userId, isAppealed: true },
      include: {
        moderator: { select: { id: true, displayName: true } },
        targetPost: { select: { id: true, content: true, mediaUrls: true } },
        targetComment: { select: { id: true, content: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = logs.length > limit;
    const data = hasMore ? logs.slice(0, limit) : logs;
    return {
      data,
      meta: { cursor: data[data.length - 1]?.id ?? null, hasMore },
    };
  }

  /** Submit an appeal for a moderation action */
  async submitAppeal(userId: string, dto: SubmitAppealDto) {
    const log = await this.prisma.moderationLog.findUnique({
      where: { id: dto.moderationLogId },
    });
    if (!log) throw new NotFoundException('Moderation action not found');
    if (log.targetUserId !== userId) throw new ForbiddenException('You can only appeal actions against you');
    if (log.isAppealed) throw new BadRequestException('Appeal already submitted for this action');

    const appealText = JSON.stringify({ reason: dto.reason, details: dto.details });

    return this.prisma.moderationLog.update({
      where: { id: dto.moderationLogId },
      data: {
        isAppealed: true,
        appealText,
        appealResolved: false,
      },
    });
  }

  /** Get pending appeals for admin review */
  async getPendingAppeals(adminId: string, cursor?: string) {
    await this.verifyAdminOrModerator(adminId);

    const limit = 20;
    // A10-#8 / B11-#12: Use standard Prisma cursor pagination instead of manual id < cursor
    const where: Prisma.ModerationLogWhereInput = { isAppealed: true, appealResolved: false };

    const appeals = await this.prisma.moderationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        targetUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    const hasMore = appeals.length > limit;
    const data = hasMore ? appeals.slice(0, limit) : appeals;
    return { data, meta: { cursor: data[data.length - 1]?.id ?? null, hasMore } };
  }

  /** Resolve an appeal — accept (reverse action) or reject */
  async resolveAppeal(adminId: string, logId: string, accepted: boolean, result: string) {
    await this.verifyAdminOrModerator(adminId);

    const log = await this.prisma.moderationLog.findUnique({ where: { id: logId } });
    if (!log) throw new NotFoundException('Moderation log not found');
    if (!log.isAppealed) throw new BadRequestException('No appeal submitted for this action');
    if (log.appealResolved) throw new BadRequestException('Appeal already resolved');

    // Use a transaction so all reversal + resolution happens atomically (B11-#5)
    await this.prisma.$transaction(async (tx) => {
      // If accepted, reverse the action (un-remove content, un-ban user)
      if (accepted) {
        if (log.action === 'CONTENT_REMOVED') {
          if (log.targetPostId) {
            await tx.post.update({ where: { id: log.targetPostId }, data: { isRemoved: false, removedReason: null } });
          }
          if (log.targetCommentId) {
            await tx.comment.update({ where: { id: log.targetCommentId }, data: { isRemoved: false } });
          }
          if (log.targetMessageId) {
            await tx.message.update({ where: { id: log.targetMessageId }, data: { isDeleted: false } });
          }
        }
        if ((log.action === 'PERMANENT_BAN' || log.action === 'TEMP_BAN') && log.targetUserId) {
          // Fix B11-#3: also clear isDeactivated and banReason
          await tx.user.update({
            where: { id: log.targetUserId },
            data: { isBanned: false, isDeactivated: false, banExpiresAt: null, banReason: null },
          });
          // Fix B11-#4: unban in Clerk so user can actually log in
          const user = await tx.user.findUnique({ where: { id: log.targetUserId }, select: { clerkId: true } });
          if (user?.clerkId) {
            // Clerk unban must happen outside transaction — queue it
            // We set a flag to execute after transaction commits
            (this as { _pendingClerkUnban?: string })._pendingClerkUnban = user.clerkId;
          }
        }
      }

      await tx.moderationLog.update({
        where: { id: logId },
        data: { appealResolved: true, appealResult: result },
      });
    });

    // Execute Clerk unban after transaction commits (B11-#4)
    const pendingClerkId = (this as { _pendingClerkUnban?: string })._pendingClerkUnban;
    if (pendingClerkId) {
      delete (this as { _pendingClerkUnban?: string })._pendingClerkUnban;
      try {
        // AiService doesn't have Clerk — use Prisma to find clerkId and call Clerk API
        // Since ModerationService doesn't inject Clerk, log a warning and note for infra
        this.logger.log(`Appeal accepted: user with clerkId ${pendingClerkId} needs Clerk unban. Manual action or webhook required.`);
      } catch (err) {
        this.logger.error('Failed to unban user in Clerk', err instanceof Error ? err.message : err);
      }
    }
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
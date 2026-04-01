import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import Redis from 'ioredis';
import { PrismaService } from '../../config/prisma.service';
import { Post, Thread, Reel, Video } from '@prisma/client';
import { PublishWorkflowService } from '../../common/services/publish-workflow.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QueueService } from '../../common/queue/queue.service';
import { extractHashtags } from '../../common/utils/hashtag';
import { acquireCronLock } from '../../common/utils/cron-lock';

export interface ScheduledItem {
  id: string;
  type: 'post' | 'thread' | 'reel' | 'video';
  title?: string;
  content?: string;
  caption?: string;
  scheduledAt: Date;
  createdAt: Date;
}

export type ScheduledContent = Post | Thread | Reel | Video;

type ContentModel = 'post' | 'thread' | 'reel' | 'video';

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    private prisma: PrismaService,
    private publishWorkflow: PublishWorkflowService,
    private notifications: NotificationsService,
    private queueService: QueueService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  private getModel(type: string): ContentModel {
    const validModels: ContentModel[] = ['post', 'thread', 'reel', 'video'];
    if (!validModels.includes(type as ContentModel)) {
      throw new BadRequestException('Invalid content type');
    }
    return type as ContentModel;
  }

  async getScheduled(userId: string): Promise<ScheduledItem[]> {
    const [posts, threads, reels, videos] = await Promise.all([
      this.prisma.post.findMany({
        where: { userId, scheduledAt: { not: null, gt: new Date() } },
        select: {
          id: true,
          content: true,
          scheduledAt: true,
          createdAt: true,
        },
      take: 50,
    }),
      this.prisma.thread.findMany({
        where: { userId, scheduledAt: { not: null, gt: new Date() } },
        select: {
          id: true,
          content: true,
          scheduledAt: true,
          createdAt: true,
        },
      take: 50,
    }),
      this.prisma.reel.findMany({
        where: { userId, scheduledAt: { not: null, gt: new Date() } },
        select: {
          id: true,
          caption: true,
          scheduledAt: true,
          createdAt: true,
        },
      take: 50,
    }),
      this.prisma.video.findMany({
        where: { userId, scheduledAt: { not: null, gt: new Date() } },
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          createdAt: true,
        },
      take: 50,
    }),
    ]);

    const scheduledItems: ScheduledItem[] = [
      ...posts.map((p) => ({
        id: p.id,
        type: 'post' as const,
        content: p.content ?? undefined,
        scheduledAt: p.scheduledAt!,
        createdAt: p.createdAt,
      })),
      ...threads.map((t) => ({
        id: t.id,
        type: 'thread' as const,
        content: t.content,
        scheduledAt: t.scheduledAt!,
        createdAt: t.createdAt,
      })),
      ...reels.map((r) => ({
        id: r.id,
        type: 'reel' as const,
        caption: r.caption ?? undefined,
        scheduledAt: r.scheduledAt!,
        createdAt: r.createdAt,
      })),
      ...videos.map((v) => ({
        id: v.id,
        type: 'video' as const,
        title: v.title,
        scheduledAt: v.scheduledAt!,
        createdAt: v.createdAt,
      })),
    ];

    return scheduledItems.sort(
      (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
    );
  }

  /**
   * Update the scheduled publish time for a content item.
   *
   * TIMEZONE HANDLING:
   * The `scheduledAt` Date is expected to already be in UTC. The mobile client
   * sends an ISO 8601 string (e.g. "2026-03-25T14:00:00Z") which the controller
   * parses via `new Date(dto.scheduledAt)`. If the client sends a timezone-aware
   * string (e.g. "2026-03-25T14:00:00+05:00"), `new Date()` automatically
   * converts it to UTC — so the stored value is always UTC.
   *
   * The `publishOverdueContent` cron compares `scheduledAt <= new Date()` which
   * also uses UTC, so the comparison is timezone-consistent.
   *
   * If a `timezone` field is added to the DTO in the future, convert via:
   *   const utcMs = scheduledAt.getTime();
   *   // No adjustment needed — JS Date is always UTC internally.
   *   // The timezone would only be used for display purposes on the client.
   */
  async updateSchedule(
    userId: string,
    type: 'post' | 'thread' | 'reel' | 'video',
    id: string,
    scheduledAt: Date,
  ): Promise<ScheduledContent> {
    // Normalize to UTC — ensure the Date is valid and in UTC
    const utcScheduledAt = new Date(scheduledAt.getTime());
    if (isNaN(utcScheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt date');
    }

    const minTime = new Date(Date.now() + 15 * 60 * 1000);
    if (utcScheduledAt < minTime) {
      throw new BadRequestException(
        'Scheduled time must be at least 15 minutes from now',
      );
    }

    const model = this.getModel(type);
    // Type-safe approach: use a helper function to handle the dynamic access
    const content = await this.findContent(model, id);
    if (!content) {
      throw new NotFoundException(`${type} not found`);
    }
    if (content.userId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    return this.updateContent(model, id, { scheduledAt: utcScheduledAt });
  }

  async cancelSchedule(
    userId: string,
    type: 'post' | 'thread' | 'reel' | 'video',
    id: string,
  ): Promise<ScheduledContent> {
    const model = this.getModel(type);
    const content = await this.findContent(model, id);
    if (!content) {
      throw new NotFoundException(`${type} not found`);
    }
    if (content.userId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    // Clear scheduledAt AND mark as removed (draft state).
    // Setting only scheduledAt: null would publish the content immediately,
    // which is wrong — cancelling a schedule should revert to draft.
    // The owner can later edit/reschedule or manually publish.
    return this.updateContent(model, id, { scheduledAt: null, isRemoved: true });
  }

  async publishNow(
    userId: string,
    type: 'post' | 'thread' | 'reel' | 'video',
    id: string,
  ): Promise<ScheduledContent> {
    const model = this.getModel(type);
    const content = await this.findContent(model, id);
    if (!content) {
      throw new NotFoundException(`${type} not found`);
    }
    if (content.userId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    const result = await this.updateContent(model, id, { scheduledAt: null });

    // Fire deferred side effects that were skipped at creation time
    await this.fireDeferredSideEffects(type, id, userId);

    return result;
  }

  /**
   * Fire all deferred side effects for a single content item being published.
   * Used by both publishNow() and publishOverdueContent().
   */
  private async fireDeferredSideEffects(
    type: 'post' | 'thread' | 'reel' | 'video',
    id: string,
    userId: string,
  ): Promise<void> {
    try {
      if (type === 'post') {
        const post = await this.prisma.post.findUnique({
          where: { id },
          select: {
            content: true, hashtags: true, mentions: true, postType: true,
            visibility: true, mediaUrls: true,
            taggedUsers: { select: { userId: true } },
            collabInvites: { select: { inviteeId: true } },
            user: { select: { username: true } },
          },
        });
        if (!post) return;

        // Publish workflow
        this.publishWorkflow.onPublish({
          contentType: 'post', contentId: id, userId,
          indexDocument: { id, content: post.content || '', hashtags: post.hashtags || [], userId, postType: post.postType, visibility: post.visibility },
        }).catch(err => this.logger.warn(`Publish workflow failed`, err instanceof Error ? err.message : err));

        // Hashtag counts — batch update instead of N+1
        const postHashtags = extractHashtags(post.content ?? '');
        if (postHashtags.length > 0) {
          this.prisma.$executeRaw`UPDATE "hashtags" SET "postsCount" = "postsCount" + 1 WHERE name = ANY(${postHashtags}::text[])`.catch(() => {});
        }

        // Gamification
        this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'post_created' }).catch(err => this.logger.warn('Queue job failed:', err?.message));
        this.queueService.addGamificationJob({ type: 'update-streak', userId, action: 'posting' }).catch(err => this.logger.warn('Queue job failed:', err?.message));

        // Notifications
        await this.firePublishNotifications(id, userId, post.user?.username ?? null, 'post', {
          mentions: post.mentions as string[],
          taggedUserIds: post.taggedUsers?.map((t: { userId: string }) => t.userId) ?? [],
          collabInviteeIds: post.collabInvites?.map((c: { inviteeId: string }) => c.inviteeId) ?? [],
        });
      } else if (type === 'thread') {
        const thread = await this.prisma.thread.findUnique({
          where: { id },
          select: { content: true, hashtags: true, mentions: true, visibility: true, user: { select: { username: true } } },
        });
        if (!thread) return;

        this.publishWorkflow.onPublish({
          contentType: 'thread', contentId: id, userId,
          indexDocument: { id, content: thread.content || '', hashtags: thread.hashtags || [], userId, visibility: thread.visibility },
        }).catch(err => this.logger.warn(`Publish workflow failed`, err instanceof Error ? err.message : err));

        const threadHashtags = extractHashtags(thread.content ?? '');
        if (threadHashtags.length > 0) {
          this.prisma.$executeRaw`UPDATE "hashtags" SET "threadsCount" = "threadsCount" + 1 WHERE name = ANY(${threadHashtags}::text[])`.catch(() => {});
        }

        this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'thread_created' }).catch(err => this.logger.warn('Queue job failed:', err?.message));
        this.queueService.addGamificationJob({ type: 'update-streak', userId, action: 'posting' }).catch(err => this.logger.warn('Queue job failed:', err?.message));

        await this.firePublishNotifications(id, userId, thread.user?.username ?? null, 'thread', {
          mentions: thread.mentions as string[],
        });
      } else if (type === 'reel') {
        const reel = await this.prisma.reel.findUnique({
          where: { id },
          select: {
            caption: true, hashtags: true, mentions: true,
            taggedUsers: { select: { userId: true } },
            user: { select: { username: true } },
          },
        });
        if (!reel) return;

        this.publishWorkflow.onPublish({
          contentType: 'reel', contentId: id, userId,
          indexDocument: { id, caption: reel.caption || '', hashtags: reel.hashtags || [], userId },
        }).catch(err => this.logger.warn(`Publish workflow failed`, err instanceof Error ? err.message : err));

        const reelHashtags = extractHashtags(reel.caption ?? '');
        if (reelHashtags.length > 0) {
          this.prisma.$executeRaw`UPDATE "hashtags" SET "reelsCount" = "reelsCount" + 1 WHERE name = ANY(${reelHashtags}::text[])`.catch(() => {});
        }

        this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'reel_created' }).catch(err => this.logger.warn('Queue job failed:', err?.message));
        this.queueService.addGamificationJob({ type: 'update-streak', userId, action: 'posting' }).catch(err => this.logger.warn('Queue job failed:', err?.message));

        await this.firePublishNotifications(id, userId, reel.user?.username ?? null, 'reel', {
          mentions: reel.mentions as string[],
          taggedUserIds: reel.taggedUsers?.map((t: { userId: string }) => t.userId) ?? [],
        });
      } else if (type === 'video') {
        const video = await this.prisma.video.findUnique({
          where: { id },
          select: { title: true, description: true, tags: true },
        });
        if (!video) return;

        this.publishWorkflow.onPublish({
          contentType: 'video', contentId: id, userId,
          indexDocument: { id, title: video.title || '', description: video.description || '', tags: video.tags || [], userId },
        }).catch(err => this.logger.warn(`Publish workflow failed`, err instanceof Error ? err.message : err));

        this.queueService.addGamificationJob({ type: 'award-xp', userId, action: 'video_created' }).catch(err => this.logger.warn('Queue job failed:', err?.message));
        this.queueService.addGamificationJob({ type: 'update-streak', userId, action: 'posting' }).catch(err => this.logger.warn('Queue job failed:', err?.message));
      }
    } catch (err) {
      this.logger.error(`Deferred side effects failed for ${type} ${id}`, err instanceof Error ? err.message : err);
    }
  }

  // Helper methods for type-safe dynamic access
  private async findContent(model: ContentModel, id: string): Promise<{ userId: string | null } | null> {
    switch (model) {
      case 'post':
        return this.prisma.post.findUnique({ where: { id }, select: { userId: true } });
      case 'thread':
        return this.prisma.thread.findUnique({ where: { id }, select: { userId: true } });
      case 'reel':
        return this.prisma.reel.findUnique({ where: { id }, select: { userId: true } });
      case 'video':
        return this.prisma.video.findUnique({ where: { id }, select: { userId: true } });
      default:
        return null;
    }
  }

  private async updateContent(
    model: ContentModel,
    id: string,
    data: { scheduledAt: Date | null; isRemoved?: boolean }
  ): Promise<ScheduledContent> {
    switch (model) {
      case 'post':
        return this.prisma.post.update({ where: { id }, data });
      case 'thread':
        return this.prisma.thread.update({ where: { id }, data });
      case 'reel':
        return this.prisma.reel.update({ where: { id }, data });
      case 'video':
        return this.prisma.video.update({ where: { id }, data });
      default:
        throw new BadRequestException('Invalid content type');
    }
  }

  /**
   * Auto-publish all content whose scheduledAt has passed.
   * Runs every minute via @nestjs/schedule cron.
   * Sets scheduledAt to null (= published) for all overdue items.
   *
   * TIMEZONE NOTE: Both `scheduledAt` (stored as UTC in Postgres) and `new Date()`
   * (UTC) are compared here, so the comparison is timezone-consistent regardless
   * of the server's local timezone. No timezone conversion is needed.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async publishOverdueContent(): Promise<{ posts: number; threads: number; reels: number; videos: number }> {
    try {
    if (!await acquireCronLock(this.redis, 'cron:publishOverdueContent', 55, this.logger)) {
      return { posts: 0, threads: 0, reels: 0, videos: 0 };
    }
    const now = new Date();
    const overdueWhere = { scheduledAt: { not: null, lte: now } as { not: null; lte: Date }, isRemoved: false };

    // 1. Find items that are about to be published (need full data for deferred side effects)
    const [overduePosts, overdueThreads, overdueReels, overdueVideos] = await Promise.all([
      this.prisma.post.findMany({
        where: overdueWhere,
        select: {
          id: true, userId: true, content: true, hashtags: true, mentions: true,
          postType: true, visibility: true, mediaUrls: true,
          taggedUsers: { select: { userId: true } },
          collabInvites: { select: { inviteeId: true } },
          user: { select: { username: true } },
        },
        take: 100,
      }),
      this.prisma.thread.findMany({
        where: overdueWhere,
        select: {
          id: true, userId: true, content: true, hashtags: true, mentions: true, visibility: true,
          user: { select: { username: true } },
        },
        take: 100,
      }),
      this.prisma.reel.findMany({
        where: overdueWhere,
        select: {
          id: true, userId: true, caption: true, hashtags: true, mentions: true,
          taggedUsers: { select: { userId: true } },
          user: { select: { username: true } },
        },
        take: 100,
      }),
      this.prisma.video.findMany({
        where: overdueWhere,
        select: { id: true, userId: true, title: true, description: true, tags: true },
        take: 100,
      }),
    ]);

    // 2. Preserve original scheduledAt, then set scheduledAt to null (= published)
    // First copy scheduledAt → originalScheduledAt for analytics/history
    await Promise.all([
      this.prisma.$executeRaw`UPDATE "posts" SET "originalScheduledAt" = "scheduledAt" WHERE "scheduledAt" IS NOT NULL AND "scheduledAt" <= ${now} AND "isRemoved" = false AND "originalScheduledAt" IS NULL`,
      this.prisma.$executeRaw`UPDATE "threads" SET "originalScheduledAt" = "scheduledAt" WHERE "scheduledAt" IS NOT NULL AND "scheduledAt" <= ${now} AND "isRemoved" = false AND "originalScheduledAt" IS NULL`,
      this.prisma.$executeRaw`UPDATE "reels" SET "originalScheduledAt" = "scheduledAt" WHERE "scheduledAt" IS NOT NULL AND "scheduledAt" <= ${now} AND "isRemoved" = false AND "originalScheduledAt" IS NULL`,
      this.prisma.$executeRaw`UPDATE "videos" SET "originalScheduledAt" = "scheduledAt" WHERE "scheduledAt" IS NOT NULL AND "scheduledAt" <= ${now} AND "isRemoved" = false AND "originalScheduledAt" IS NULL`,
    ]);
    // Then clear scheduledAt to mark as published
    const [posts, threads, reels, videos] = await Promise.all([
      this.prisma.post.updateMany({
        where: overdueWhere,
        data: { scheduledAt: null },
      }),
      this.prisma.thread.updateMany({
        where: overdueWhere,
        data: { scheduledAt: null },
      }),
      this.prisma.reel.updateMany({
        where: overdueWhere,
        data: { scheduledAt: null },
      }),
      this.prisma.video.updateMany({
        where: overdueWhere,
        data: { scheduledAt: null },
      }),
    ]);

    // 3. Fire deferred side effects for each newly-published item.
    //    These were skipped at creation time because the content was scheduled:
    //    - Publish workflow (search index, cache invalidation, real-time event)
    //    - Hashtag count increments
    //    - Gamification XP + streak
    //    - Mention / tag / collaborator notifications
    for (const post of overduePosts) {
      if (!post.userId) continue;

      // Notify author their scheduled post is now published
      this.notifications.create({
        userId: post.userId, actorId: null, type: 'SYSTEM', postId: post.id,
        title: 'Post published!',
        body: `Your scheduled post is now live.`,
      }).catch(err => this.logger.warn(`Notification failed for scheduled post ${post.id}`, err instanceof Error ? err.message : err));

      // Publish workflow
      this.publishWorkflow.onPublish({
        contentType: 'post',
        contentId: post.id,
        userId: post.userId,
        indexDocument: {
          id: post.id,
          content: post.content || '',
          hashtags: post.hashtags || [],
          userId: post.userId,
          postType: post.postType,
          visibility: post.visibility,
        },
      }).catch(err => this.logger.warn(`Publish workflow failed for scheduled post ${post.id}`, err instanceof Error ? err.message : err));

      // Hashtag count increment — batched
      const postHashtags2 = extractHashtags(post.content ?? '');
      if (postHashtags2.length > 0) {
        this.prisma.$executeRaw`UPDATE "hashtags" SET "postsCount" = "postsCount" + 1 WHERE name = ANY(${postHashtags2}::text[])`.catch(() => {});
      }

      // Deferred: Gamification XP
      this.queueService.addGamificationJob({ type: 'award-xp', userId: post.userId, action: 'post_created' }).catch(err => this.logger.warn('Queue job failed:', err?.message));
      this.queueService.addGamificationJob({ type: 'update-streak', userId: post.userId, action: 'posting' }).catch(err => this.logger.warn('Queue job failed:', err?.message));

      // Deferred: Mention, tag, and collaborator notifications
      this.firePublishNotifications(post.id, post.userId, post.user?.username ?? null, 'post', {
        mentions: post.mentions as string[],
        taggedUserIds: post.taggedUsers?.map((t: { userId: string }) => t.userId) ?? [],
        collabInviteeIds: post.collabInvites?.map((c: { inviteeId: string }) => c.inviteeId) ?? [],
      }).catch(err => this.logger.warn(`Notifications failed for scheduled post ${post.id}`, err instanceof Error ? err.message : err));
    }

    for (const thread of overdueThreads) {
      if (!thread.userId) continue;

      // Notify author their scheduled thread is now published
      this.notifications.create({
        userId: thread.userId, actorId: null, type: 'SYSTEM', threadId: thread.id,
        title: 'Thread published!',
        body: `Your scheduled thread is now live.`,
      }).catch(err => this.logger.warn(`Notification failed for scheduled thread ${thread.id}`, err instanceof Error ? err.message : err));

      this.publishWorkflow.onPublish({
        contentType: 'thread',
        contentId: thread.id,
        userId: thread.userId,
        indexDocument: {
          id: thread.id,
          content: thread.content || '',
          hashtags: thread.hashtags || [],
          userId: thread.userId,
          visibility: thread.visibility,
        },
      }).catch(err => this.logger.warn(`Publish workflow failed for scheduled thread ${thread.id}`, err instanceof Error ? err.message : err));

      // Deferred: Hashtag count increment
      const threadHashtags2 = extractHashtags(thread.content ?? '');
      if (threadHashtags2.length > 0) {
        this.prisma.$executeRaw`UPDATE "hashtags" SET "threadsCount" = "threadsCount" + 1 WHERE name = ANY(${threadHashtags2}::text[])`.catch(() => {});
      }

      // Deferred: Gamification XP
      this.queueService.addGamificationJob({ type: 'award-xp', userId: thread.userId, action: 'thread_created' }).catch(err => this.logger.warn('Queue job failed:', err?.message));
      this.queueService.addGamificationJob({ type: 'update-streak', userId: thread.userId, action: 'posting' }).catch(err => this.logger.warn('Queue job failed:', err?.message));

      // Deferred: Mention notifications
      this.firePublishNotifications(thread.id, thread.userId, thread.user?.username ?? null, 'thread', {
        mentions: thread.mentions as string[],
      }).catch(err => this.logger.warn(`Notifications failed for scheduled thread ${thread.id}`, err instanceof Error ? err.message : err));
    }

    for (const reel of overdueReels) {
      if (!reel.userId) continue;

      // Notify author their scheduled reel is now published
      this.notifications.create({
        userId: reel.userId, actorId: null, type: 'SYSTEM', reelId: reel.id,
        title: 'Reel published!',
        body: `Your scheduled reel is now live.`,
      }).catch(err => this.logger.warn(`Notification failed for scheduled reel ${reel.id}`, err instanceof Error ? err.message : err));

      this.publishWorkflow.onPublish({
        contentType: 'reel',
        contentId: reel.id,
        userId: reel.userId,
        indexDocument: {
          id: reel.id,
          caption: reel.caption || '',
          hashtags: reel.hashtags || [],
          userId: reel.userId,
        },
      }).catch(err => this.logger.warn(`Publish workflow failed for scheduled reel ${reel.id}`, err instanceof Error ? err.message : err));

      // Hashtag count increment — batched
      const reelHashtags2 = extractHashtags(reel.caption ?? '');
      if (reelHashtags2.length > 0) {
        this.prisma.$executeRaw`UPDATE "hashtags" SET "reelsCount" = "reelsCount" + 1 WHERE name = ANY(${reelHashtags2}::text[])`.catch(() => {});
      }

      // Deferred: Gamification XP
      this.queueService.addGamificationJob({ type: 'award-xp', userId: reel.userId, action: 'reel_created' }).catch(err => this.logger.warn('Queue job failed:', err?.message));
      this.queueService.addGamificationJob({ type: 'update-streak', userId: reel.userId, action: 'posting' }).catch(err => this.logger.warn('Queue job failed:', err?.message));

      // Deferred: Tag + mention notifications
      this.firePublishNotifications(reel.id, reel.userId, reel.user?.username ?? null, 'reel', {
        mentions: reel.mentions as string[],
        taggedUserIds: reel.taggedUsers?.map((t: { userId: string }) => t.userId) ?? [],
      }).catch(err => this.logger.warn(`Notifications failed for scheduled reel ${reel.id}`, err instanceof Error ? err.message : err));
    }

    for (const video of overdueVideos) {
      if (!video.userId) continue;

      this.publishWorkflow.onPublish({
        contentType: 'video',
        contentId: video.id,
        userId: video.userId,
        indexDocument: {
          id: video.id,
          title: video.title || '',
          description: video.description || '',
          tags: video.tags || [],
          userId: video.userId,
        },
      }).catch(err => this.logger.warn(`Publish workflow failed for scheduled video ${video.id}`, err instanceof Error ? err.message : err));

      // Deferred: Gamification XP
      this.queueService.addGamificationJob({ type: 'award-xp', userId: video.userId, action: 'video_created' }).catch(err => this.logger.warn('Queue job failed:', err?.message));
      this.queueService.addGamificationJob({ type: 'update-streak', userId: video.userId, action: 'posting' }).catch(err => this.logger.warn('Queue job failed:', err?.message));

      // Deferred: Notify author their scheduled video is now published
      this.notifications.create({
        userId: video.userId,
        actorId: null,
        type: 'SYSTEM',
        videoId: video.id,
        title: 'Video published!',
        body: `Your scheduled video "${(video.title || 'Untitled').slice(0, 50)}" is now live.`,
      }).catch(err => this.logger.warn(`Notification failed for scheduled video ${video.id}`, err instanceof Error ? err.message : err));
    }

    const result = {
      posts: posts.count,
      threads: threads.count,
      reels: reels.count,
      videos: videos.count,
    };

    const totalPublished = result.posts + result.threads + result.reels + result.videos;
    if (totalPublished > 0) {
      this.logger.log(`Auto-published ${totalPublished} items: ${JSON.stringify(result)}`);
    }

    return result;
    } catch (error) {
      this.logger.error('publishOverdueContent cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return { posts: 0, threads: 0, reels: 0, videos: 0 };
    }
  }

  /**
   * Fire deferred notifications when scheduled content is published.
   * Handles mention, tag, and collaborator invite notifications.
   */
  private async firePublishNotifications(
    contentId: string,
    authorId: string,
    authorUsername: string | null,
    contentType: 'post' | 'thread' | 'reel',
    opts: {
      mentions?: string[];
      taggedUserIds?: string[];
      collabInviteeIds?: string[];
    },
  ): Promise<void> {
    const actorName = authorUsername ?? 'Someone';

    // Build the notification reference field based on content type
    const refField = contentType === 'post'
      ? { postId: contentId }
      : contentType === 'reel'
        ? { reelId: contentId }
        : { threadId: contentId };

    // Mention notifications
    if (opts.mentions?.length) {
      const mentionedUsers = await this.prisma.user.findMany({
        where: { username: { in: opts.mentions } },
        select: { id: true },
        take: 50,
      });
      for (const mentioned of mentionedUsers) {
        if (mentioned.id !== authorId) {
          this.notifications.create({
            userId: mentioned.id,
            actorId: authorId,
            type: 'MENTION',
            ...refField,
            title: 'Mentioned you',
            body: `@${actorName} mentioned you in a ${contentType}`,
          }).catch(err => this.logger.error('Deferred mention notification failed', err instanceof Error ? err.message : err));
        }
      }
    }

    // Tag notifications (posts and reels only)
    if (opts.taggedUserIds?.length) {
      for (const taggedUserId of opts.taggedUserIds) {
        if (taggedUserId !== authorId) {
          this.notifications.create({
            userId: taggedUserId,
            actorId: authorId,
            type: 'TAG',
            ...refField,
            title: 'Tagged you',
            body: `@${actorName} tagged you in a ${contentType}`,
          }).catch(err => this.logger.error('Deferred tag notification failed', err instanceof Error ? err.message : err));
        }
      }
    }

    // Collaborator invite notifications (posts only)
    if (opts.collabInviteeIds?.length) {
      for (const inviteeId of opts.collabInviteeIds) {
        if (inviteeId !== authorId) {
          this.notifications.create({
            userId: inviteeId,
            actorId: authorId,
            type: 'COLLAB_INVITE',
            ...refField,
            title: 'Collaboration invite',
            body: `@${actorName} invited you to collaborate on a ${contentType}`,
          }).catch(err => this.logger.error('Deferred collab notification failed', err instanceof Error ? err.message : err));
        }
      }
    }
  }
}
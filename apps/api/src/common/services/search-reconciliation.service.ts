import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { PrismaService } from '../../config/prisma.service';
import { QueueService } from '../queue/queue.service';

/**
 * Phase 3, Workstream 5: Search index reconciliation.
 *
 * Ensures the Meilisearch index stays in sync with the database.
 * Runs weekly to re-index content that may have been missed due to
 * queue failures, Redis outages, or deployment gaps.
 *
 * Policy:
 * - Posts/Reels/Threads created in the last 7 days are re-indexed
 * - Removed content is explicitly deleted from index
 * - This is a safety net, not the primary indexing path
 */
@Injectable()
export class SearchReconciliationService {
  private readonly logger = new Logger(SearchReconciliationService.name);

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
  ) {}

  @Cron('0 5 * * 0') // Every Sunday at 5 AM
  async reconcileSearchIndex() {
    try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let indexed = 0;
    let deleted = 0;

    // Re-index recent posts
    const recentPosts = await this.prisma.post.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, isRemoved: false },
      select: { id: true, content: true, hashtags: true, userId: true },
      take: 1000,
    });

    for (const post of recentPosts) {
      await this.queueService.addSearchIndexJob({
        action: 'index',
        indexName: 'posts',
        documentId: post.id,
        document: { id: post.id, content: post.content, hashtags: post.hashtags, userId: post.userId, type: 'post' },
      }).catch(() => {});
      indexed++;
    }

    // Remove recently-deleted posts from index
    const removedPosts = await this.prisma.post.findMany({
      where: { updatedAt: { gte: sevenDaysAgo }, isRemoved: true },
      select: { id: true },
      take: 500,
    });

    for (const post of removedPosts) {
      await this.queueService.addSearchIndexJob({
        action: 'delete',
        indexName: 'posts',
        documentId: post.id,
      }).catch(() => {});
      deleted++;
    }

    // Re-index recent threads
    const recentThreads = await this.prisma.thread.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, isRemoved: false },
      select: { id: true, content: true, hashtags: true, userId: true },
      take: 1000,
    });

    for (const thread of recentThreads) {
      await this.queueService.addSearchIndexJob({
        action: 'index',
        indexName: 'threads',
        documentId: thread.id,
        document: { id: thread.id, content: thread.content, hashtags: thread.hashtags, userId: thread.userId, type: 'thread' },
      }).catch(() => {});
      indexed++;
    }

    // Re-index recent reels
    const recentReels = await this.prisma.reel.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, isRemoved: false, status: 'READY' },
      select: { id: true, caption: true, hashtags: true, userId: true },
      take: 1000,
    });

    for (const reel of recentReels) {
      await this.queueService.addSearchIndexJob({
        action: 'index',
        indexName: 'reels',
        documentId: reel.id,
        document: { id: reel.id, caption: reel.caption, hashtags: reel.hashtags, userId: reel.userId, type: 'reel' },
      }).catch(() => {});
      indexed++;
    }

    // Remove recently-deleted threads from index
    const removedThreads = await this.prisma.thread.findMany({
      where: { updatedAt: { gte: sevenDaysAgo }, isRemoved: true },
      select: { id: true },
      take: 500,
    });

    for (const thread of removedThreads) {
      await this.queueService.addSearchIndexJob({
        action: 'delete',
        indexName: 'threads',
        documentId: thread.id,
      }).catch(() => {});
      deleted++;
    }

    // Remove recently-deleted reels from index
    const removedReels = await this.prisma.reel.findMany({
      where: { updatedAt: { gte: sevenDaysAgo }, isRemoved: true },
      select: { id: true },
      take: 500,
    });

    for (const reel of removedReels) {
      await this.queueService.addSearchIndexJob({
        action: 'delete',
        indexName: 'reels',
        documentId: reel.id,
      }).catch(() => {});
      deleted++;
    }

    // Re-index recent videos
    const recentVideos = await this.prisma.video.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, isRemoved: false, status: 'PUBLISHED' },
      select: { id: true, title: true, description: true, tags: true, userId: true, channelId: true, category: true },
      take: 1000,
    });

    for (const video of recentVideos) {
      await this.queueService.addSearchIndexJob({
        action: 'index',
        indexName: 'videos',
        documentId: video.id,
        document: { id: video.id, title: video.title, description: video.description, tags: video.tags, userId: video.userId, channelId: video.channelId, category: video.category, type: 'video' },
      }).catch(() => {});
      indexed++;
    }

    // Remove recently-deleted videos from index
    const removedVideos = await this.prisma.video.findMany({
      where: { updatedAt: { gte: sevenDaysAgo }, isRemoved: true },
      select: { id: true },
      take: 500,
    });

    for (const video of removedVideos) {
      await this.queueService.addSearchIndexJob({
        action: 'delete',
        indexName: 'videos',
        documentId: video.id,
      }).catch(() => {});
      deleted++;
    }

    // Re-index recent users (active, not banned/deleted)
    const recentUsers = await this.prisma.user.findMany({
      where: { createdAt: { gte: sevenDaysAgo }, isBanned: false, isDeleted: false, isDeactivated: false },
      select: { id: true, username: true, displayName: true, bio: true },
      take: 1000,
    });

    for (const user of recentUsers) {
      await this.queueService.addSearchIndexJob({
        action: 'index',
        indexName: 'users',
        documentId: user.id,
        document: { id: user.id, username: user.username, displayName: user.displayName, bio: user.bio, type: 'user' },
      }).catch(() => {});
      indexed++;
    }

    // Remove banned/deleted users from index
    const removedUsers = await this.prisma.user.findMany({
      where: { updatedAt: { gte: sevenDaysAgo }, OR: [{ isBanned: true }, { isDeleted: true }] },
      select: { id: true },
      take: 500,
    });

    for (const user of removedUsers) {
      await this.queueService.addSearchIndexJob({
        action: 'delete',
        indexName: 'users',
        documentId: user.id,
      }).catch(() => {});
      deleted++;
    }

    // Re-index recent hashtags
    const recentHashtags = await this.prisma.hashtag.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { id: true, name: true },
      take: 1000,
    });

    for (const hashtag of recentHashtags) {
      await this.queueService.addSearchIndexJob({
        action: 'index',
        indexName: 'hashtags',
        documentId: hashtag.id,
        document: { id: hashtag.id, name: hashtag.name, type: 'hashtag' },
      }).catch(() => {});
      indexed++;
    }

    if (indexed > 0 || deleted > 0) {
      this.logger.log(`Search reconciliation: ${indexed} documents re-indexed, ${deleted} removed`);
    }

    return { indexed, deleted };
    } catch (error) {
      this.logger.error('reconcileSearchIndex cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return { indexed: 0, deleted: 0 };
    }
  }
}

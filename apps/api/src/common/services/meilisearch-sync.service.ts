import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { MeilisearchService } from '../../modules/search/meilisearch.service';

/**
 * Full Meilisearch sync service.
 * Backfills ALL existing content into Meilisearch indexes.
 * Run once after Meilisearch is first deployed, or on-demand via admin API.
 *
 * Processes in batches of 500 to avoid memory issues.
 */
@Injectable()
export class MeilisearchSyncService {
  private readonly logger = new Logger(MeilisearchSyncService.name);

  constructor(
    private prisma: PrismaService,
    private meilisearch: MeilisearchService,
  ) {}

  async syncAll(): Promise<Record<string, number>> {
    if (!this.meilisearch.isAvailable()) {
      return { error: -1 };
    }

    const results: Record<string, number> = {};

    results.users = await this.syncUsers();
    results.posts = await this.syncPosts();
    results.threads = await this.syncThreads();
    results.reels = await this.syncReels();
    results.videos = await this.syncVideos();
    results.hashtags = await this.syncHashtags();

    this.logger.log(`Meilisearch full sync complete: ${JSON.stringify(results)}`);
    return results;
  }

  private async syncUsers(): Promise<number> {
    const BATCH = 500;
    let total = 0;
    let cursor: string | undefined;

    while (true) {
      const users = await this.prisma.user.findMany({
        where: { isDeactivated: false, isBanned: false, isDeleted: false },
        select: { id: true, username: true, displayName: true, bio: true, avatarUrl: true, isVerified: true, followersCount: true },
        take: BATCH + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
      });

      const batch = users.slice(0, BATCH);
      if (batch.length === 0) break;

      await this.meilisearch.addDocuments('users', batch.map(u => ({
        id: u.id,
        type: 'user',
        username: u.username,
        displayName: u.displayName,
        bio: u.bio,
        isVerified: u.isVerified,
        followerCount: u.followersCount,
      })));

      total += batch.length;
      cursor = batch[batch.length - 1].id;

      if (users.length <= BATCH) break;
    }

    this.logger.log(`Synced ${total} users to Meilisearch`);
    return total;
  }

  private async syncPosts(): Promise<number> {
    const BATCH = 500;
    let total = 0;
    let cursor: string | undefined;

    while (true) {
      const posts = await this.prisma.post.findMany({
        where: { isRemoved: false, visibility: 'PUBLIC' },
        select: { id: true, content: true, hashtags: true, userId: true, postType: true, likesCount: true, createdAt: true,
          user: { select: { username: true } } },
        take: BATCH + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
      });

      const batch = posts.slice(0, BATCH);
      if (batch.length === 0) break;

      await this.meilisearch.addDocuments('posts', batch.map(p => ({
        id: p.id,
        type: 'post',
        content: p.content,
        hashtags: p.hashtags,
        userId: p.userId,
        username: p.user?.username,
        postType: p.postType,
        likesCount: p.likesCount,
        createdAt: p.createdAt.toISOString(),
        visibility: 'PUBLIC',
        isRemoved: false,
      })));

      total += batch.length;
      cursor = batch[batch.length - 1].id;

      if (posts.length <= BATCH) break;
    }

    this.logger.log(`Synced ${total} posts to Meilisearch`);
    return total;
  }

  private async syncThreads(): Promise<number> {
    const BATCH = 500;
    let total = 0;
    let cursor: string | undefined;

    while (true) {
      const threads = await this.prisma.thread.findMany({
        where: { isRemoved: false, visibility: 'PUBLIC', isChainHead: true },
        select: { id: true, content: true, hashtags: true, userId: true, likesCount: true, createdAt: true,
          user: { select: { username: true } } },
        take: BATCH + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
      });

      const batch = threads.slice(0, BATCH);
      if (batch.length === 0) break;

      await this.meilisearch.addDocuments('threads', batch.map(t => ({
        id: t.id,
        type: 'thread',
        content: t.content,
        hashtags: t.hashtags,
        userId: t.userId,
        username: t.user?.username,
        likesCount: t.likesCount,
        createdAt: t.createdAt.toISOString(),
        visibility: 'PUBLIC',
        isRemoved: false,
        isChainHead: true,
      })));

      total += batch.length;
      cursor = batch[batch.length - 1].id;

      if (threads.length <= BATCH) break;
    }

    this.logger.log(`Synced ${total} threads to Meilisearch`);
    return total;
  }

  private async syncReels(): Promise<number> {
    const BATCH = 500;
    let total = 0;
    let cursor: string | undefined;

    while (true) {
      const reels = await this.prisma.reel.findMany({
        where: { isRemoved: false, status: 'READY' },
        select: { id: true, caption: true, hashtags: true, userId: true, likesCount: true, viewsCount: true, createdAt: true,
          user: { select: { username: true } } },
        take: BATCH + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
      });

      const batch = reels.slice(0, BATCH);
      if (batch.length === 0) break;

      await this.meilisearch.addDocuments('reels', batch.map(r => ({
        id: r.id,
        type: 'reel',
        content: r.caption,
        hashtags: r.hashtags,
        userId: r.userId,
        username: r.user?.username,
        likesCount: r.likesCount,
        viewsCount: r.viewsCount,
        createdAt: r.createdAt.toISOString(),
        status: 'READY',
        isRemoved: false,
      })));

      total += batch.length;
      cursor = batch[batch.length - 1].id;

      if (reels.length <= BATCH) break;
    }

    this.logger.log(`Synced ${total} reels to Meilisearch`);
    return total;
  }

  private async syncVideos(): Promise<number> {
    const BATCH = 500;
    let total = 0;
    let cursor: string | undefined;

    while (true) {
      const videos = await this.prisma.video.findMany({
        where: { isRemoved: false, status: 'PUBLISHED' },
        select: { id: true, title: true, description: true, tags: true, userId: true, channelId: true,
          viewsCount: true, likesCount: true, createdAt: true, category: true,
          user: { select: { username: true } } },
        take: BATCH + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
      });

      const batch = videos.slice(0, BATCH);
      if (batch.length === 0) break;

      await this.meilisearch.addDocuments('videos', batch.map(v => ({
        id: v.id,
        type: 'video',
        title: v.title,
        description: v.description,
        tags: v.tags,
        userId: v.userId,
        username: v.user?.username,
        channelId: v.channelId,
        category: v.category,
        viewsCount: v.viewsCount,
        likesCount: v.likesCount,
        createdAt: v.createdAt.toISOString(),
        status: 'PUBLISHED',
        isRemoved: false,
      })));

      total += batch.length;
      cursor = batch[batch.length - 1].id;

      if (videos.length <= BATCH) break;
    }

    this.logger.log(`Synced ${total} videos to Meilisearch`);
    return total;
  }

  private async syncHashtags(): Promise<number> {
    const BATCH = 500;
    let total = 0;
    let cursor: string | undefined;

    while (true) {
      const tags = await this.prisma.hashtag.findMany({
        select: { id: true, name: true, postsCount: true, createdAt: true },
        take: BATCH + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
      });

      const batch = tags.slice(0, BATCH);
      if (batch.length === 0) break;

      await this.meilisearch.addDocuments('hashtags', batch.map(h => ({
        id: h.id,
        type: 'hashtag',
        name: h.name,
        postsCount: h.postsCount,
        createdAt: h.createdAt.toISOString(),
      })));

      total += batch.length;
      cursor = batch[batch.length - 1].id;

      if (tags.length <= BATCH) break;
    }

    this.logger.log(`Synced ${total} hashtags to Meilisearch`);
    return total;
  }
}

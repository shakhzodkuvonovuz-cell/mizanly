import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { EmbeddingContentType, ReelStatus, PostVisibility, ThreadVisibility } from '@prisma/client';

@Injectable()
export class EmbeddingPipelineService {
  private readonly logger = new Logger(EmbeddingPipelineService.name);
  private isRunning = false;
  private readonly BATCH_SIZE = 20;

  constructor(
    private prisma: PrismaService,
    private embeddings: EmbeddingsService,
  ) {}

  /**
   * Backfill all existing content that lacks embeddings.
   * Processes in batches to avoid rate limits and memory issues.
   */
  async backfillAll(): Promise<{ posts: number; reels: number; threads: number; videos: number }> {
    if (this.isRunning) {
      this.logger.warn('Embedding pipeline already running — skipping');
      return { posts: 0, reels: 0, threads: 0, videos: 0 };
    }

    this.isRunning = true;
    const counts = { posts: 0, reels: 0, threads: 0, videos: 0 };

    try {
      counts.posts = await this.backfillPosts();
      counts.reels = await this.backfillReels();
      counts.threads = await this.backfillThreads();
      counts.videos = await this.backfillVideos();

      this.logger.log(
        `Backfill complete: ${counts.posts} posts, ${counts.reels} reels, ${counts.threads} threads, ${counts.videos} videos`,
      );
    } catch (error) {
      this.logger.error('Backfill failed', error instanceof Error ? error.message : error);
    } finally {
      this.isRunning = false;
    }

    return counts;
  }

  /**
   * Get IDs of content that already has embeddings
   */
  private async getEmbeddedIds(contentType: EmbeddingContentType): Promise<Set<string>> {
    const existing = await this.prisma.$queryRawUnsafe<Array<{ contentId: string }>>(
      `SELECT "contentId" FROM embeddings WHERE "contentType" = $1::"EmbeddingContentType"`,
      contentType,
    );
    return new Set(existing.map(e => e.contentId));
  }

  private async backfillPosts(): Promise<number> {
    const embeddedIds = await this.getEmbeddedIds(EmbeddingContentType.POST);
    let count = 0;
    let cursor: string | undefined;

    while (true) {
      const posts = await this.prisma.post.findMany({
        where: {
          isRemoved: false,
          visibility: PostVisibility.PUBLIC,
          content: { not: null },
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        take: this.BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (posts.length === 0) break;

      for (const post of posts) {
        if (embeddedIds.has(post.id)) continue;
        const ok = await this.embeddings.embedPost(post.id);
        if (ok) count++;
        // Rate limit: ~100ms between calls
        await this.sleep(100);
      }

      cursor = posts[posts.length - 1].id;
      this.logger.debug(`Posts backfill progress: ${count} embedded`);
    }

    return count;
  }

  private async backfillReels(): Promise<number> {
    const embeddedIds = await this.getEmbeddedIds(EmbeddingContentType.REEL);
    let count = 0;
    let cursor: string | undefined;

    while (true) {
      const reels = await this.prisma.reel.findMany({
        where: {
          isRemoved: false,
          status: ReelStatus.READY,
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        take: this.BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (reels.length === 0) break;

      for (const reel of reels) {
        if (embeddedIds.has(reel.id)) continue;
        const ok = await this.embeddings.embedReel(reel.id);
        if (ok) count++;
        await this.sleep(100);
      }

      cursor = reels[reels.length - 1].id;
      this.logger.debug(`Reels backfill progress: ${count} embedded`);
    }

    return count;
  }

  private async backfillThreads(): Promise<number> {
    const embeddedIds = await this.getEmbeddedIds(EmbeddingContentType.THREAD);
    let count = 0;
    let cursor: string | undefined;

    while (true) {
      const threads = await this.prisma.thread.findMany({
        where: {
          isRemoved: false,
          visibility: ThreadVisibility.PUBLIC,
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        take: this.BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (threads.length === 0) break;

      for (const thread of threads) {
        if (embeddedIds.has(thread.id)) continue;
        const ok = await this.embeddings.embedThread(thread.id);
        if (ok) count++;
        await this.sleep(100);
      }

      cursor = threads[threads.length - 1].id;
      this.logger.debug(`Threads backfill progress: ${count} embedded`);
    }

    return count;
  }

  private async backfillVideos(): Promise<number> {
    const embeddedIds = await this.getEmbeddedIds(EmbeddingContentType.VIDEO);
    let count = 0;
    let cursor: string | undefined;

    while (true) {
      const videos = await this.prisma.video.findMany({
        where: {
          status: 'PUBLISHED',
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
        take: this.BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (videos.length === 0) break;

      for (const video of videos) {
        if (embeddedIds.has(video.id)) continue;
        const ok = await this.embeddings.embedVideo(video.id);
        if (ok) count++;
        await this.sleep(100);
      }

      cursor = videos[videos.length - 1].id;
      this.logger.debug(`Videos backfill progress: ${count} embedded`);
    }

    return count;
  }

  /**
   * Embed a single piece of content (called on new content creation)
   */
  async embedNewContent(contentId: string, contentType: EmbeddingContentType): Promise<boolean> {
    switch (contentType) {
      case EmbeddingContentType.POST:
        return this.embeddings.embedPost(contentId);
      case EmbeddingContentType.REEL:
        return this.embeddings.embedReel(contentId);
      case EmbeddingContentType.THREAD:
        return this.embeddings.embedThread(contentId);
      case EmbeddingContentType.VIDEO:
        return this.embeddings.embedVideo(contentId);
      default:
        return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

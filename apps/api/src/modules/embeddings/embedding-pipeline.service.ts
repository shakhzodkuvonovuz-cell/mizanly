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
    let count = 0;
    let consecutiveFailBatches = 0;

    while (true) {
      const posts = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT p.id FROM "posts" p
         WHERE p."isRemoved" = false AND p."visibility" = 'PUBLIC' AND p."content" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e."contentId" = p.id AND e."contentType" = 'POST')
         ORDER BY p."createdAt" DESC
         LIMIT $1`,
        this.BATCH_SIZE,
      );

      if (posts.length === 0) break;

      let batchSuccesses = 0;
      for (const post of posts) {
        const ok = await this.embeddings.embedPost(post.id);
        if (ok) { count++; batchSuccesses++; }
        await this.sleep(100);
      }

      if (batchSuccesses === 0) {
        if (++consecutiveFailBatches >= 3) { this.logger.warn(`Posts backfill: 3 failed batches, aborting. Embedded ${count}.`); break; }
      } else { consecutiveFailBatches = 0; }

      this.logger.debug(`Posts backfill progress: ${count} embedded`);
    }

    return count;
  }

  private async backfillReels(): Promise<number> {
    let count = 0;
    let consecutiveFailBatches = 0;

    while (true) {
      const reels = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT r.id FROM "reels" r
         WHERE r."isRemoved" = false AND r."status" = 'READY'
         AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e."contentId" = r.id AND e."contentType" = 'REEL')
         ORDER BY r."createdAt" DESC LIMIT $1`,
        this.BATCH_SIZE,
      );

      if (reels.length === 0) break;

      let batchSuccesses = 0;
      for (const reel of reels) {
        const ok = await this.embeddings.embedReel(reel.id);
        if (ok) { count++; batchSuccesses++; }
        await this.sleep(100);
      }

      if (batchSuccesses === 0) {
        if (++consecutiveFailBatches >= 3) { this.logger.warn(`Reels backfill: 3 failed batches, aborting.`); break; }
      } else { consecutiveFailBatches = 0; }

      this.logger.debug(`Reels backfill progress: ${count} embedded`);
    }

    return count;
  }

  private async backfillThreads(): Promise<number> {
    let count = 0;
    let consecutiveFailBatches = 0;

    while (true) {
      const threads = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT t.id FROM "threads" t
         WHERE t."isRemoved" = false AND t."visibility" = 'PUBLIC'
         AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e."contentId" = t.id AND e."contentType" = 'THREAD')
         ORDER BY t."createdAt" DESC LIMIT $1`,
        this.BATCH_SIZE,
      );

      if (threads.length === 0) break;

      let batchSuccesses = 0;
      for (const thread of threads) {
        const ok = await this.embeddings.embedThread(thread.id);
        if (ok) { count++; batchSuccesses++; }
        await this.sleep(100);
      }

      if (batchSuccesses === 0) {
        if (++consecutiveFailBatches >= 3) { this.logger.warn(`Threads backfill: 3 failed batches, aborting.`); break; }
      } else { consecutiveFailBatches = 0; }

      this.logger.debug(`Threads backfill progress: ${count} embedded`);
    }

    return count;
  }

  private async backfillVideos(): Promise<number> {
    let count = 0;
    let consecutiveFailBatches = 0;

    while (true) {
      const videos = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT v.id FROM "videos" v
         WHERE v."status" = 'PUBLISHED'
         AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e."contentId" = v.id AND e."contentType" = 'VIDEO')
         ORDER BY v."createdAt" DESC LIMIT $1`,
        this.BATCH_SIZE,
      );

      if (videos.length === 0) break;

      let batchSuccesses = 0;
      for (const video of videos) {
        const ok = await this.embeddings.embedVideo(video.id);
        if (ok) { count++; batchSuccesses++; }
        await this.sleep(100);
      }

      if (batchSuccesses === 0) {
        if (++consecutiveFailBatches >= 3) { this.logger.warn(`Videos backfill: 3 failed batches, aborting.`); break; }
      } else { consecutiveFailBatches = 0; }

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

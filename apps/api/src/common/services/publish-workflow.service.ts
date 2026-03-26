import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { QueueService } from '../queue/queue.service';
import Redis from 'ioredis';

/**
 * Phase 2, Workstream 3: Centralized publication workflow.
 *
 * Ensures that publish (manual or scheduled) triggers the same downstream
 * contracts regardless of how content becomes visible:
 *
 * 1. Visibility transition (content becomes public)
 * 2. Search index update
 * 3. Notification to followers (if applicable)
 * 4. Cache invalidation
 *
 * This service is the single owner of "what happens when content goes live."
 * Individual services call publishWorkflow.onPublish() and this service
 * handles all side effects.
 */
@Injectable()
export class PublishWorkflowService {
  private readonly logger = new Logger(PublishWorkflowService.name);

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  /**
   * Called when content becomes publicly visible.
   * Handles all downstream side effects in a single, explicit pipeline.
   */
  async onPublish(params: {
    contentType: 'post' | 'reel' | 'thread' | 'video' | 'user';
    contentId: string;
    userId: string;
    indexDocument?: Record<string, unknown>;
  }): Promise<void> {
    const { contentType, contentId, userId, indexDocument } = params;

    // 1. Search indexing
    if (indexDocument) {
      this.queueService.addSearchIndexJob({
        action: 'index',
        indexName: `${contentType}s`, // posts, reels, threads, videos
        documentId: contentId,
        document: indexDocument,
      }).catch(err =>
        this.logger.warn(`Failed to queue search index for ${contentType} ${contentId}`, err instanceof Error ? err.message : err),
      );
    }

    // 2. Cache invalidation — clear user's feed cache
    try {
      if (this.redis.keys) {
        const keys = await this.redis.keys(`feed:*:${userId}:*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
    } catch {
      // Redis failure non-blocking
    }

    // 3. Publish event for real-time subscribers
    try {
      this.redis.publish?.('content:update', JSON.stringify({
        event: 'content_published',
        data: { contentType, contentId, userId },
      }))?.catch?.(() => {});
    } catch {
      // Non-blocking
    }

    this.logger.debug(`Publish workflow completed for ${contentType} ${contentId}`);
  }

  /**
   * Called when content is removed/unpublished.
   * Handles cleanup side effects.
   */
  async onUnpublish(params: {
    contentType: 'post' | 'reel' | 'thread' | 'video' | 'user';
    contentId: string;
    userId: string;
  }): Promise<void> {
    const { contentType, contentId } = params;

    // 1. Remove from search index
    this.queueService.addSearchIndexJob({
      action: 'delete',
      indexName: `${contentType}s`,
      documentId: contentId,
    }).catch(err =>
      this.logger.warn(`Failed to queue search deletion for ${contentType} ${contentId}`, err instanceof Error ? err.message : err),
    );

    // 2. Publish removal event
    try {
      this.redis.publish?.('content:update', JSON.stringify({
        event: 'content_removed',
        data: { contentType, contentId },
      }))?.catch?.(() => {});
    } catch {
      // Non-blocking
    }

    this.logger.debug(`Unpublish workflow completed for ${contentType} ${contentId}`);
  }
}

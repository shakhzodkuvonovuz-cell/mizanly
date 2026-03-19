import { Injectable, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';

/**
 * QueueService — high-level API for enqueuing jobs across all BullMQ queues.
 *
 * Each method maps to a specific queue with typed job data.
 * Workers are started in the corresponding processor classes.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @Inject('QUEUE_NOTIFICATIONS') private notificationsQueue: Queue,
    @Inject('QUEUE_MEDIA_PROCESSING') private mediaQueue: Queue,
    @Inject('QUEUE_ANALYTICS') private analyticsQueue: Queue,
    @Inject('QUEUE_WEBHOOKS') private webhooksQueue: Queue,
    @Inject('QUEUE_SEARCH_INDEXING') private searchQueue: Queue,
    @Inject('QUEUE_AI_TASKS') private aiTasksQueue: Queue,
  ) {}

  async onModuleDestroy() {
    await Promise.allSettled([
      this.notificationsQueue.close(),
      this.mediaQueue.close(),
      this.analyticsQueue.close(),
      this.webhooksQueue.close(),
      this.searchQueue.close(),
      this.aiTasksQueue.close(),
    ]);
  }

  // ── Notification Jobs ─────────────────────────────────────

  async addPushNotificationJob(data: { notificationId: string }): Promise<string> {
    const job = await this.notificationsQueue.add('push-trigger', data, {
      attempts: 3,
      backoff: { type: 'custom' },
    });
    this.logger.debug(`Enqueued push notification job ${job.id}`);
    return job.id!;
  }

  async addBulkPushJob(data: { userIds: string[]; title: string; body: string; pushData?: Record<string, string> }): Promise<string> {
    const job = await this.notificationsQueue.add('bulk-push', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    return job.id!;
  }

  // ── Media Processing Jobs ─────────────────────────────────

  async addMediaProcessingJob(data: {
    type: 'image-resize' | 'blurhash' | 'video-transcode';
    mediaUrl: string;
    mediaKey: string;
    userId: string;
    contentType?: string;
    contentId?: string;
  }): Promise<string> {
    const job = await this.mediaQueue.add(data.type, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    return job.id!;
  }

  // ── Analytics Jobs ────────────────────────────────────────

  async addGamificationJob(data: {
    type: 'award-xp' | 'update-streak';
    userId: string;
    action: string;
  }): Promise<string> {
    const job = await this.analyticsQueue.add(data.type, data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 1000 },
    });
    return job.id!;
  }

  async addEngagementTrackingJob(data: {
    type: 'view' | 'like' | 'comment' | 'share';
    userId: string;
    contentType: string;
    contentId: string;
  }): Promise<string> {
    const job = await this.analyticsQueue.add('track-engagement', data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 500 },
    });
    return job.id!;
  }

  // ── Webhook Jobs ──────────────────────────────────────────

  async addWebhookDeliveryJob(data: {
    url: string;
    secret: string;
    event: string;
    payload: Record<string, unknown>;
    webhookId: string;
  }): Promise<string> {
    const job = await this.webhooksQueue.add('deliver', data, {
      attempts: 5,
      backoff: { type: 'custom' },
    });
    return job.id!;
  }

  // ── Search Indexing Jobs ──────────────────────────────────

  async addSearchIndexJob(data: {
    action: 'index' | 'update' | 'delete';
    indexName: string;
    documentId: string;
    document?: Record<string, unknown>;
  }): Promise<string> {
    const job = await this.searchQueue.add(data.action, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    return job.id!;
  }

  // ── AI Task Jobs ──────────────────────────────────────────

  async addModerationJob(data: {
    content: string;
    contentType: 'post' | 'thread' | 'comment' | 'message' | 'reel';
    contentId: string;
  }): Promise<string> {
    const job = await this.aiTasksQueue.add('moderate', data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
    });
    return job.id!;
  }

  async addCaptionGenerationJob(data: {
    contentId: string;
    contentType: string;
    mediaUrl: string;
  }): Promise<string> {
    const job = await this.aiTasksQueue.add('generate-caption', data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
    });
    return job.id!;
  }

  // ── Stats ─────────────────────────────────────────────────

  async getStats(): Promise<Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }>> {
    const queues = [
      { name: 'notifications', queue: this.notificationsQueue },
      { name: 'media-processing', queue: this.mediaQueue },
      { name: 'analytics', queue: this.analyticsQueue },
      { name: 'webhooks', queue: this.webhooksQueue },
      { name: 'search-indexing', queue: this.searchQueue },
      { name: 'ai-tasks', queue: this.aiTasksQueue },
    ];

    const stats: Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }> = {};

    for (const { name, queue } of queues) {
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ]);
        stats[name] = { waiting, active, completed, failed, delayed };
      } catch {
        stats[name] = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
      }
    }

    return stats;
  }
}

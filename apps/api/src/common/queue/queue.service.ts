import { Injectable, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { getCorrelationId } from '../middleware/correlation-id.store';
import { CircuitBreakerService } from '../services/circuit-breaker.service';
import { DlqService } from './dlq.service';

/**
 * QueueService -- high-level API for enqueuing jobs across all BullMQ queues.
 *
 * Each method maps to a specific queue with typed job data.
 * Workers are started in the corresponding processor classes.
 *
 * Correlation ID propagation: each job data payload includes an optional
 * `correlationId` field extracted from the current request context via AsyncLocalStorage.
 * Processors extract this ID and attach to Sentry scope + log context.
 *
 * All queue.add() calls go through the 'redis' circuit breaker so that when
 * Redis is down, callers fail-fast instead of waiting for connection timeout.
 *
 * DLQ routing is handled by DlqService (extracted to break circular deps).
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
    private circuitBreaker: CircuitBreakerService,
    private dlq: DlqService,
  ) {}

  /** Attach correlationId from the current request context to job data */
  private withCorrelation<T extends Record<string, unknown>>(data: T): T & { correlationId?: string } {
    const correlationId = getCorrelationId();
    return correlationId ? { ...data, correlationId } : data;
  }

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

  // -- Notification Jobs ---------------------------------------------------

  async addPushNotificationJob(data: { notificationId: string }): Promise<string> {
    // K04-#16 FIX: Use notificationId as jobId for natural deduplication
    const job = await this.circuitBreaker.exec('redis', () =>
      this.notificationsQueue.add('push-trigger', this.withCorrelation(data), {
        jobId: `push:${data.notificationId}`,
        attempts: 3,
        backoff: { type: 'custom' },
      }),
    );
    this.logger.debug(`Enqueued push notification job ${job.id}`);
    return job.id!;
  }

  // -- Media Processing Jobs -----------------------------------------------

  /**
   * Enqueue a media processing job (EXIF strip, resize variants, BlurHash generation).
   * Called after successful media upload in content creation flows.
   */
  async addMediaProcessingJob(data: {
    mediaUrl: string;
    mediaKey: string;
    userId: string;
    contentType: 'post' | 'story' | 'thread' | 'reel' | 'video';
    contentId: string;
  }): Promise<string> {
    const resizeJob = await this.circuitBreaker.exec('redis', () =>
      this.mediaQueue.add('image-resize', this.withCorrelation({
        type: 'image-resize' as const,
        ...data,
      }), {
        jobId: `media:resize:${data.mediaKey}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }),
    );

    // Enqueue BlurHash generation as a separate job
    this.circuitBreaker.exec('redis', () =>
      this.mediaQueue.add('blurhash', this.withCorrelation({
        type: 'blurhash' as const,
        ...data,
      }), {
        jobId: `media:blurhash:${data.mediaKey}`,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    ).catch((err) => {
      this.logger.warn(`Failed to enqueue BlurHash job for ${data.mediaKey}: ${err instanceof Error ? err.message : err}`);
    });

    this.logger.debug(`Enqueued media processing jobs for ${data.mediaKey}`);
    return resizeJob.id!;
  }

  /**
   * Enqueue a bulk push notification job.
   * Used for mass notifications: admin announcements, broadcast channel messages,
   * or any scenario where 100+ users need the same push notification.
   * The processor persists DB notification records before sending push.
   */
  async addBulkPushJob(data: {
    userIds: string[];
    title: string;
    body: string;
    pushData?: Record<string, string>;
  }): Promise<string> {
    const job = await this.circuitBreaker.exec('redis', () =>
      this.notificationsQueue.add('bulk-push', this.withCorrelation(data), {
        attempts: 3,
        backoff: { type: 'custom' },
      }),
    );
    this.logger.debug(`Enqueued bulk-push job ${job.id} for ${data.userIds.length} users`);
    return job.id!;
  }

  // -- Analytics Jobs ------------------------------------------------------

  async addGamificationJob(data: {
    type: 'award-xp' | 'update-streak';
    userId: string;
    action: string;
  }): Promise<string> {
    const job = await this.circuitBreaker.exec('redis', () =>
      this.analyticsQueue.add(data.type, this.withCorrelation(data), {
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    );
    return job.id!;
  }

  /**
   * Enqueue an engagement tracking job for durable batch analytics.
   * Fire-and-forget from caller's perspective -- used when users view/interact with content.
   * The processor logs the event for future data warehouse / cohort analysis.
   */
  async addEngagementTrackingJob(data: {
    type: 'view' | 'like' | 'comment' | 'share';
    userId: string;
    contentType: string;
    contentId: string;
  }): Promise<string> {
    const job = await this.circuitBreaker.exec('redis', () =>
      this.analyticsQueue.add('track-engagement', this.withCorrelation(data), {
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    );
    return job.id!;
  }

  // -- Webhook Jobs --------------------------------------------------------

  async addWebhookDeliveryJob(data: {
    url: string;
    secret: string;
    event: string;
    payload: Record<string, unknown>;
    webhookId: string;
  }): Promise<string> {
    // K04-#1 FIX: Compute HMAC signature at enqueue time so the secret
    // is never stored in Redis job data (it was exposed in plaintext).
    const { createHmac } = await import('crypto');
    const body = JSON.stringify(data.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', data.secret).update(`${timestamp}.${body}`).digest('hex');

    const jobData = {
      url: data.url,
      event: data.event,
      payload: data.payload,
      webhookId: data.webhookId,
      signature,
      timestamp,
    };

    // #118 FIX: Use content hash as jobId for automatic dedup of duplicate webhook deliveries.
    // Previous approach used timestamp in jobId which allowed duplicate processing of the same event.
    const payloadHash = (await import('crypto')).createHash('sha256')
      .update(JSON.stringify({ webhookId: data.webhookId, event: data.event, payload: data.payload }))
      .digest('hex')
      .slice(0, 16);

    const job = await this.circuitBreaker.exec('redis', () =>
      this.webhooksQueue.add('deliver', this.withCorrelation(jobData), {
        jobId: `wh:${payloadHash}`,
        attempts: 5,
        backoff: { type: 'custom' },
      }),
    );
    return job.id!;
  }

  // -- Search Indexing Jobs ------------------------------------------------

  async addSearchIndexJob(data: {
    action: 'index' | 'update' | 'delete';
    indexName: string;
    documentId: string;
    document?: Record<string, unknown>;
  }): Promise<string> {
    const job = await this.circuitBreaker.exec('redis', () =>
      this.searchQueue.add(data.action, this.withCorrelation(data), {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    );
    return job.id!;
  }

  // -- AI Task Jobs --------------------------------------------------------

  async addModerationJob(data: {
    content: string;
    contentType: 'post' | 'thread' | 'comment' | 'message' | 'reel';
    contentId: string;
  }): Promise<string> {
    const job = await this.circuitBreaker.exec('redis', () =>
      this.aiTasksQueue.add('moderate', this.withCorrelation(data), {
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
      }),
    );
    return job.id!;
  }

  // -- Dead Letter Queue ---------------------------------------------------

  /**
   * Delegates to DlqService for backward compatibility.
   * Processors now inject DlqService directly; this method exists
   * so callers outside the queue module (if any) don't break.
   */
  async moveToDlq(job: Job | undefined, error: Error, queueName: string): Promise<void> {
    return this.dlq.moveToDlq(job, error, queueName);
  }

  // -- Stats ---------------------------------------------------------------

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
      } catch (err) {
        this.logger.warn(`Failed to get stats for queue '${name}': ${err instanceof Error ? err.message : err}`);
        stats[name] = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
      }
    }

    return stats;
  }
}

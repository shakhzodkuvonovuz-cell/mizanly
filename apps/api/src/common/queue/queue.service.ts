import { Injectable, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import * as Sentry from '@sentry/node';
import Redis from 'ioredis';
import { getCorrelationId } from '../middleware/correlation-id.store';
import { CircuitBreakerService } from '../services/circuit-breaker.service';
import { PrismaService } from '../../config/prisma.service';

/**
 * QueueService — high-level API for enqueuing jobs across all BullMQ queues.
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
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);

  private static readonly DLQ_KEY = 'mizanly:dlq';
  private static readonly DLQ_MAX_SIZE = 1000;

  constructor(
    @Inject('QUEUE_NOTIFICATIONS') private notificationsQueue: Queue,
    @Inject('QUEUE_MEDIA_PROCESSING') private mediaQueue: Queue,
    @Inject('QUEUE_ANALYTICS') private analyticsQueue: Queue,
    @Inject('QUEUE_WEBHOOKS') private webhooksQueue: Queue,
    @Inject('QUEUE_SEARCH_INDEXING') private searchQueue: Queue,
    @Inject('QUEUE_AI_TASKS') private aiTasksQueue: Queue,
    @Inject('REDIS') private redis: Redis,
    private circuitBreaker: CircuitBreakerService,
    private prisma: PrismaService,
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

  // ── Notification Jobs ─────────────────────────────────────

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

  // ── Media Processing Jobs ──────────────────────────────────

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

  // ── Analytics Jobs ────────────────────────────────────────

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
   * Fire-and-forget from caller's perspective — used when users view/interact with content.
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

  // ── Webhook Jobs ──────────────────────────────────────────

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

    const job = await this.circuitBreaker.exec('redis', () =>
      this.webhooksQueue.add('deliver', this.withCorrelation(jobData), {
        jobId: `wh:${data.webhookId}:${data.event}:${timestamp}`,
        attempts: 5,
        backoff: { type: 'custom' },
      }),
    );
    return job.id!;
  }

  // ── Search Indexing Jobs ──────────────────────────────────

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

  // ── AI Task Jobs ──────────────────────────────────────────

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

  // ── Dead Letter Queue ────────────────────────────────────

  /**
   * Moves a permanently failed job to the dead letter queue (Redis list).
   * Called by processor `on('failed')` handlers when a job exhausts all retries.
   * Keeps the last 1000 entries to prevent unbounded growth.
   */
  async moveToDlq(job: Job | undefined, error: Error, queueName: string): Promise<void> {
    if (!job) return;

    // Only move to DLQ if this was the final attempt
    const maxAttempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;

    // X07-#17 FIX: Strip sensitive fields from DLQ entries (webhook secrets, tokens)
    const sanitizedData = { ...job.data };
    delete sanitizedData.secret;
    delete sanitizedData.token;
    delete sanitizedData.signingSecret;
    delete sanitizedData.apiKey;
    delete sanitizedData.webhookSecret;

    const entry = {
      jobId: job.id,
      queue: queueName,
      name: job.name,
      data: sanitizedData,
      error: error.message,
      failedAt: new Date().toISOString(),
      attempts: job.attemptsMade,
    };

    // Dual storage: Redis (fast retrieval for admin dashboard) + DB (durable, survives flush)
    // Track failures explicitly — .catch() converts rejections to fulfilled, breaking allSettled checks
    let redisFailed = false;
    let dbFailed = false;

    const redisDone = this.redis.lpush(QueueService.DLQ_KEY, JSON.stringify(entry))
      .then(() => this.redis.ltrim(QueueService.DLQ_KEY, 0, QueueService.DLQ_MAX_SIZE - 1))
      // J07-H2: Set 7-day TTL on DLQ list to prevent unbounded Redis memory
      .then(() => this.redis.expire(QueueService.DLQ_KEY, 7 * 86400))
      .catch((dlqError) => {
        redisFailed = true;
        this.logger.error(`Redis DLQ storage failed for job ${job.id}: ${dlqError instanceof Error ? dlqError.message : 'unknown'}`);
      });

    const dbDone = this.prisma.failedJob.create({
      data: {
        queue: queueName,
        jobName: job.name,
        jobId: job.id ?? null,
        data: JSON.parse(JSON.stringify(job.data ?? {})),
        error: error.message,
        attempts: job.attemptsMade,
      },
    }).catch((dbError) => {
      dbFailed = true;
      this.logger.error(`DB DLQ storage failed for job ${job.id}: ${dbError instanceof Error ? dbError.message : 'unknown'}`);
    });

    // Wait for both to complete — both promises have .catch() so Promise.all won't reject
    await Promise.all([redisDone, dbDone]);

    // If both failed, capture to Sentry as absolute last resort
    if (redisFailed && dbFailed) {
      Sentry.captureException(error, {
        tags: { queue: queueName, jobName: job.name },
        extra: { jobId: job.id, jobData: job.data, attempts: job.attemptsMade },
      });
      this.logger.error(`CRITICAL: Both Redis AND DB DLQ failed for job ${job.id}. Captured in Sentry.`);
    }

    this.logger.error(`Job ${job.id} (${queueName}/${job.name}) moved to DLQ after ${job.attemptsMade} attempts: ${error.message}`);
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
      } catch (err) {
        this.logger.warn(`Failed to get stats for queue '${name}': ${err instanceof Error ? err.message : err}`);
        stats[name] = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
      }
    }

    return stats;
  }
}

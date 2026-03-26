import { Injectable, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import * as Sentry from '@sentry/node';
import Redis from 'ioredis';
import { getCorrelationId } from '../middleware/correlation-id.store';
import { CircuitBreakerService } from '../services/circuit-breaker.service';

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
    // Backoff strategy: 3 attempts with custom delays (1s, 10s, 60s)
    // defined in NotificationProcessor.backoffStrategy (notification.processor.ts).
    // Using 'custom' type because the delays are non-standard exponential.
    // If switching to separate worker processes, change to 'exponential' with delay: 1000.
    const job = await this.circuitBreaker.exec('redis', () =>
      this.notificationsQueue.add('push-trigger', this.withCorrelation(data), {
        attempts: 3,
        backoff: { type: 'custom' },
      }),
    );
    this.logger.debug(`Enqueued push notification job ${job.id}`);
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

  // ── Webhook Jobs ──────────────────────────────────────────

  async addWebhookDeliveryJob(data: {
    url: string;
    secret: string;
    event: string;
    payload: Record<string, unknown>;
    webhookId: string;
  }): Promise<string> {
    // Backoff strategy: 5 attempts with custom delays (1s, 5s, 30s, 5m, 30m)
    // defined in WebhookProcessor.backoffStrategy (webhook.processor.ts).
    // Using 'custom' type for webhook-specific progressive delays.
    // If switching to separate worker processes, change to 'exponential' with delay: 1000.
    const job = await this.circuitBreaker.exec('redis', () =>
      this.webhooksQueue.add('deliver', this.withCorrelation(data), {
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

    const entry = JSON.stringify({
      jobId: job.id,
      queue: queueName,
      name: job.name,
      data: job.data,
      error: error.message,
      failedAt: new Date().toISOString(),
      attempts: job.attemptsMade,
    });

    try {
      await this.redis.lpush(QueueService.DLQ_KEY, entry);
      await this.redis.ltrim(QueueService.DLQ_KEY, 0, QueueService.DLQ_MAX_SIZE - 1);
      this.logger.error(
        `Job ${job.id} (${queueName}/${job.name}) moved to DLQ after ${job.attemptsMade} attempts: ${error.message}`,
      );
    } catch (dlqError) {
      // DLQ Redis storage failed — ensure the failed job is at least visible in Sentry
      Sentry.captureException(error, {
        tags: { queue: queueName, jobName: job.name },
        extra: {
          jobId: job.id,
          jobData: job.data,
          attempts: job.attemptsMade,
          dlqError: dlqError instanceof Error ? dlqError.message : 'Unknown DLQ error',
        },
      });
      this.logger.error(
        `CRITICAL: DLQ storage failed for job ${job.id} (${queueName}/${job.name}). Captured in Sentry as fallback.`,
      );
    }
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

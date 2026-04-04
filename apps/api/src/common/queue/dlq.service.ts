import { Injectable, Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import * as Sentry from '@sentry/node';
import Redis from 'ioredis';
import { PrismaService } from '../../config/prisma.service';

/**
 * DlqService -- Dead Letter Queue routing for permanently failed BullMQ jobs.
 *
 * Extracted from QueueService to break the circular dependency:
 * QueueModule -> NotificationsModule -> NotificationsService -> QueueService.
 *
 * Processors inject DlqService directly (no forwardRef needed) to route
 * exhausted jobs to both Redis (fast admin dashboard retrieval) and PostgreSQL
 * (durable, survives Redis flush).
 */
@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  private static readonly DLQ_KEY = 'mizanly:dlq';
  private static readonly DLQ_MAX_SIZE = 1000;

  constructor(
    @Inject('REDIS') private redis: Redis,
    private prisma: PrismaService,
  ) {}

  /**
   * Moves a permanently failed job to the dead letter queue (Redis list + DB).
   * Called by processor `on('failed')` handlers when a job exhausts all retries.
   * Keeps the last 1000 entries in Redis to prevent unbounded growth.
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
    // Track failures explicitly -- .catch() converts rejections to fulfilled, breaking allSettled checks
    let redisFailed = false;
    let dbFailed = false;

    const redisDone = this.redis.lpush(DlqService.DLQ_KEY, JSON.stringify(entry))
      .then(() => this.redis.ltrim(DlqService.DLQ_KEY, 0, DlqService.DLQ_MAX_SIZE - 1))
      // J07-H2: Set 7-day TTL on DLQ list to prevent unbounded Redis memory
      .then(() => this.redis.expire(DlqService.DLQ_KEY, 7 * 86400))
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

    // Wait for both to complete -- both promises have .catch() so Promise.all won't reject
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
}

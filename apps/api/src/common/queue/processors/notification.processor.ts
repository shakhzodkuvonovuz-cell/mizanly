import * as Sentry from "@sentry/node";
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PushTriggerService } from '../../../modules/notifications/push-trigger.service';
import { PushService } from '../../../modules/notifications/push.service';
import { PrismaService } from '../../../config/prisma.service';
import { NotificationType } from '@prisma/client';
import { DlqService } from '../dlq.service';
import { attachCorrelationId } from '../with-correlation';

/**
 * Notification processor -- handles push notification delivery via BullMQ worker.
 *
 * Retry strategy: 3 attempts with custom backoff (1s, 10s, 60s).
 * This ensures transient failures (network glitches, Expo API hiccups)
 * are retried without overwhelming the push service.
 */
@Injectable()
export class NotificationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private config: ConfigService,
    private pushTrigger: PushTriggerService,
    private pushService: PushService,
    private prisma: PrismaService,
    private dlq: DlqService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set -- notification worker disabled');
      return;
    }

    this.worker = new Worker(
      'notifications',
      async (job: Job) => {
        attachCorrelationId(job, this.logger);
        switch (job.name) {
          case 'push-trigger':
            await this.processPushTrigger(job);
            break;
          case 'bulk-push':
            await this.processBulkPush(job);
            break;
          default:
            throw new Error(`Unknown notification job type: ${job.name}`);
        }
      },
      {
        connection: { url: redisUrl },
        prefix: 'mizanly',
        concurrency: 5,
        lockDuration: 60000,
        maxStalledCount: 3,
        settings: {
          backoffStrategy: (attemptsMade: number) => {
            // Custom backoff: 1s, 10s, 60s
            const delays = [1000, 10000, 60000];
            return delays[Math.min(attemptsMade - 1, delays.length - 1)];
          },
        },
      },
    );

    // X07-#5 FIX: Merge duplicate 'completed' handlers into one
    this.worker.on('completed', (job: Job) => {
      this.logger.debug(`Notification job ${job.id} completed`);
      const duration = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
      if (duration > 5000) this.logger.warn(`Job ${job.id} (${job.name}) took ${duration}ms`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      const maxAttempts = job?.opts?.attempts ?? 3;
      if (job && job.attemptsMade >= maxAttempts) {
        Sentry.captureException(err, {
          tags: { queue: 'notifications', jobName: job.name },
          extra: { jobId: job.id, attemptsMade: job.attemptsMade, data: job.data },
        });
        this.dlq.moveToDlq(job, err, 'notifications').catch((e) => this.logger.error('DLQ routing failed for notifications', e?.message));
      }
      this.logger.error(`Notification job ${job?.id} failed (attempt ${job?.attemptsMade ?? '?'}/${maxAttempts}): ${err.message}`);
    });

    this.worker.on('error', (err: Error) => {
      this.logger.error(`Notification worker error: ${err.message}`);
      Sentry.captureException(err, { tags: { queue: 'notifications' } });
    });

    this.worker.on('stalled', (jobId: string) => {
      this.logger.warn(`Notification job ${jobId} stalled -- being re-executed`);
    });

    this.logger.log('Notification worker started');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private async processPushTrigger(job: Job<{ notificationId: string }>): Promise<void> {
    const { notificationId } = job.data;
    await this.pushTrigger.triggerPush(notificationId);
  }

  private async processBulkPush(job: Job<{ userIds: string[]; title: string; body: string; pushData?: Record<string, string> }>): Promise<void> {
    const { userIds, title, body, pushData } = job.data;

    // Persist notification records in DB before sending push (so they appear in notification feed)
    if (userIds.length > 0) {
      await this.prisma.notification.createMany({
        data: userIds.map(userId => ({
          userId,
          type: NotificationType.SYSTEM,
          title,
          body,
        })),
        skipDuplicates: true,
      }).catch(err => this.logger.warn('Failed to persist bulk notification records', err instanceof Error ? err.message : err));
    }

    await this.pushService.sendToUsers(userIds, { title, body, data: pushData });
  }
}

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PushTriggerService } from '../../../modules/notifications/push-trigger.service';
import { PushService } from '../../../modules/notifications/push.service';

/**
 * Notification processor — handles push notification delivery via BullMQ worker.
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
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set — notification worker disabled');
      return;
    }

    this.worker = new Worker(
      'notifications',
      async (job: Job) => {
        switch (job.name) {
          case 'push-trigger':
            await this.processPushTrigger(job);
            break;
          case 'bulk-push':
            await this.processBulkPush(job);
            break;
          default:
            this.logger.warn(`Unknown notification job type: ${job.name}`);
        }
      },
      {
        connection: { url: redisUrl },
        concurrency: 5,
        settings: {
          backoffStrategy: (attemptsMade: number) => {
            // Custom backoff: 1s, 10s, 60s
            const delays = [1000, 10000, 60000];
            return delays[Math.min(attemptsMade - 1, delays.length - 1)];
          },
        },
      },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.debug(`Notification job ${job.id} completed`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(`Notification job ${job?.id} failed: ${err.message}`);
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
    await this.pushService.sendToUsers(userIds, { title, body, data: pushData });
  }
}

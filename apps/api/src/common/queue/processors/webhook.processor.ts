import * as Sentry from "@sentry/node";
import { Injectable, Logger, OnModuleInit, OnModuleDestroy, forwardRef, Inject } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../config/prisma.service';
import { createHmac } from 'crypto';
import { QueueService } from '../queue.service';
import { assertNotPrivateUrl } from '../../utils/ssrf';
import { attachCorrelationId } from '../with-correlation';

interface WebhookJobData {
  url: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
  webhookId: string;
}

/**
 * Webhook processor — delivers webhook payloads with HMAC-SHA256 signing.
 *
 * Retry strategy: 5 attempts with custom backoff (1s, 5s, 30s, 5m, 30m).
 * This aggressive retry schedule ensures reliable delivery even through
 * extended downtime on the receiver's end.
 */
@Injectable()
export class WebhookProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    @Inject(forwardRef(() => QueueService)) private queueService: QueueService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL not set — webhook worker disabled');
      return;
    }

    this.worker = new Worker(
      'webhooks',
      async (job: Job<WebhookJobData>) => {
        attachCorrelationId(job, this.logger);
        await this.deliverWebhook(job);
      },
      {
        connection: { url: redisUrl },
        concurrency: 25,
        settings: {
          backoffStrategy: (attemptsMade: number) => {
            // Custom backoff: 1s, 5s, 30s, 5min, 30min
            const delays = [1000, 5000, 30000, 300000, 1800000];
            return delays[Math.min(attemptsMade - 1, delays.length - 1)];
          },
        },
      },
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.debug(`Webhook job ${job.id} delivered`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      this.logger.error(`Webhook job ${job?.id} failed permanently: ${err.message}`);
      Sentry.captureException(err, { tags: { queue: job?.queueName, jobId: job?.id } });
      this.queueService.moveToDlq(job, err, 'webhooks').catch(() => {});
    });

    this.worker.on('completed', (job) => {
      const duration = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
      if (duration > 5000) this.logger.warn(`Job ${job.id} (${job.name}) took ${duration}ms`);
    });
    this.logger.log('Webhook worker started');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private async validateUrl(url: string): Promise<void> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      throw new Error('Webhook URL: only HTTPS is allowed');
    }
    await assertNotPrivateUrl(url, 'Webhook URL');
  }

  private async deliverWebhook(job: Job<WebhookJobData>): Promise<void> {
    const { url, secret, event, payload, webhookId } = job.data;
    if (!url || !secret || !event) {
      this.logger.warn(`Invalid webhook job ${job.id}: missing required fields`);
      return;
    }

    await this.validateUrl(url);

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    // Include timestamp in HMAC to prevent replay attacks
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mizanly-Signature': `sha256=${signature}`,
        'X-Mizanly-Event': event,
        'X-Mizanly-Timestamp': timestamp,
        'X-Mizanly-Delivery': job.id || 'unknown',
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const statusText = `${response.status} ${response.statusText}`;
      this.logger.warn(`Webhook delivery to ${url} failed: ${statusText} (attempt ${job.attemptsMade + 1}/${(job.opts.attempts ?? 5)})`);
      throw new Error(`Webhook delivery failed: ${statusText}`);
    }

    // Update last used timestamp
    try {
      await this.prisma.webhook.update({
        where: { id: webhookId },
        data: { lastUsedAt: new Date() },
      });
    } catch {
      // Non-critical — webhook may have been deleted
    }

    this.logger.debug(`Webhook delivered to ${url} (${event})`);
  }
}

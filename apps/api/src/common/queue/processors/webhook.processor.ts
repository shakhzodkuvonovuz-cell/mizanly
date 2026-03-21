import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../config/prisma.service';
import { createHmac } from 'crypto';

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
        await this.deliverWebhook(job);
      },
      {
        connection: { url: redisUrl },
        concurrency: 10,
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
    });

    this.logger.log('Webhook worker started');
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  private validateUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') throw new Error('Only HTTPS allowed');
      const blocked = ['localhost', '127.0.0.1', '169.254.', '10.', '192.168.', '172.16.', '::1', '0.0.0.0'];
      if (blocked.some(p => parsed.hostname.includes(p))) throw new Error('Internal URLs blocked');
    } catch (err) {
      throw new Error(`Invalid webhook URL: ${err instanceof Error ? err.message : 'malformed'}`);
    }
  }

  private async deliverWebhook(job: Job<WebhookJobData>): Promise<void> {
    const { url, secret, event, payload, webhookId } = job.data;
    if (!url || !secret || !event) {
      this.logger.warn(`Invalid webhook job ${job.id}: missing required fields`);
      return;
    }

    this.validateUrl(url);

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

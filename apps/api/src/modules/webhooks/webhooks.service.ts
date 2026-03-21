import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { createHmac, randomBytes } from 'crypto';

export type WebhookEvent = 'post.created' | 'member.joined' | 'member.left' | 'message.sent' | 'live.started' | 'live.ended';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Validate webhook URL: HTTPS only, no private/internal IPs
   */
  private validateWebhookUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        throw new Error('Only HTTPS URLs are allowed');
      }
      const blockedPatterns = ['localhost', '127.0.0.1', '169.254.', '10.', '192.168.', '172.16.', '::1', '0.0.0.0'];
      if (blockedPatterns.some(p => parsed.hostname.includes(p))) {
        throw new Error('Internal URLs are not allowed');
      }
    } catch (err) {
      throw new NotFoundException(`Invalid webhook URL: ${err instanceof Error ? err.message : 'malformed URL'}`);
    }
  }

  async create(userId: string, data: { circleId: string; name: string; url: string; events: string[] }) {
    this.validateWebhookUrl(data.url);
    const secret = randomBytes(32).toString('hex');
    return this.prisma.webhook.create({
      data: {
        circleId: data.circleId,
        name: data.name,
        url: data.url,
        secret,
        events: data.events,
        createdById: userId,
      },
    });
  }

  async list(circleId: string) {
    return this.prisma.webhook.findMany({
      where: { circleId, isActive: true },
      select: { id: true, name: true, url: true, events: true, isActive: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(webhookId: string, userId: string) {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook) throw new NotFoundException('Webhook not found');
    if (webhook.createdById !== userId) throw new NotFoundException('Webhook not found');
    return this.prisma.webhook.delete({ where: { id: webhookId } });
  }

  async test(webhookId: string, userId: string) {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook || !webhook.url) throw new NotFoundException('Webhook not found');
    // Authorization: only the webhook creator can trigger test deliveries
    if (webhook.createdById !== userId) throw new NotFoundException('Webhook not found');

    const payload = { event: 'test', data: { message: 'Webhook test from Mizanly' }, timestamp: new Date().toISOString() };
    return this.deliver(webhook.url, webhook.secret ?? '', payload);
  }

  /**
   * Deliver a webhook payload with HMAC-SHA256 signature.
   * Retries 3 times with exponential backoff on failure.
   */
  async deliver(url: string, secret: string, payload: Record<string, unknown>): Promise<{ success: boolean; statusCode?: number }> {
    this.validateWebhookUrl(url);
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Mizanly-Signature': `sha256=${signature}`,
            'X-Mizanly-Event': (payload.event as string) ?? 'unknown',
          },
          body,
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) return { success: true, statusCode: response.status };

        this.logger.warn(`Webhook delivery failed (attempt ${attempt + 1}): ${response.status}`);
      } catch (error) {
        this.logger.warn(`Webhook delivery error (attempt ${attempt + 1}): ${error instanceof Error ? error.message : error}`);
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }

    return { success: false };
  }

  /**
   * Dispatch an event to all active webhooks for a community that subscribe to it.
   */
  async dispatch(circleId: string, event: WebhookEvent, data: Record<string, unknown>) {
    const webhooks = await this.prisma.webhook.findMany({
      where: { circleId, isActive: true, url: { not: null } },
    });

    const matching = webhooks.filter(w => w.events.includes(event));
    const payload = { event, data, timestamp: new Date().toISOString() };

    const results = await Promise.allSettled(
      matching.map(async (webhook) => {
        const result = await this.deliver(webhook.url!, webhook.secret ?? '', payload);
        await this.prisma.webhook.update({
          where: { id: webhook.id },
          data: { lastUsedAt: new Date() },
        });
        return result;
      }),
    );

    return { dispatched: matching.length, results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false }) };
  }
}

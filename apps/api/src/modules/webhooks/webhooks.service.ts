import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
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
  private async validateWebhookUrl(url: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid webhook URL: malformed URL');
    }

    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('Only HTTPS webhook URLs are allowed');
    }

    // Block known private/internal hostnames
    const blockedHostnames = ['localhost', 'internal', 'metadata.google.internal'];
    if (blockedHostnames.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
      throw new BadRequestException('Internal hostnames are not allowed for webhooks');
    }

    // If hostname looks like an IP address, validate it directly
    if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)) {
      if (this.isPrivateIP(parsed.hostname)) {
        throw new BadRequestException('Webhook URL points to a private/reserved IP address');
      }
    }

    // Resolve DNS and reject private/reserved IP ranges (skip in test env)
    if (process.env.NODE_ENV !== 'test') {
      try {
        const dns = await import('dns');
        const { resolve4 } = dns.promises;
        const ips = await resolve4(parsed.hostname);

        for (const ip of ips) {
          if (this.isPrivateIP(ip)) {
            throw new BadRequestException('Webhook URL resolves to a private/reserved IP address');
          }
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException('Could not resolve webhook URL hostname');
      }
    }
  }

  private isPrivateIP(ip: string): boolean {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return true; // Not valid IPv4 — block
    const [a, b] = parts;
    return (
      a === 10 ||                          // 10.0.0.0/8
      a === 127 ||                          // 127.0.0.0/8 loopback
      (a === 172 && b >= 16 && b <= 31) ||  // 172.16.0.0/12
      (a === 192 && b === 168) ||           // 192.168.0.0/16
      (a === 169 && b === 254) ||           // 169.254.0.0/16 link-local
      a === 0 ||                            // 0.0.0.0/8
      (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGN
      (a === 198 && (b === 18 || b === 19)) // 198.18.0.0/15 benchmarking
    );
  }

  private static readonly VALID_EVENTS: WebhookEvent[] = ['post.created', 'member.joined', 'member.left', 'message.sent', 'live.started', 'live.ended'];

  /**
   * Verify user is a member with OWNER or ADMIN role in the specified circle.
   */
  private async requireCircleAdmin(circleId: string, userId: string): Promise<void> {
    const membership = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
      select: { role: true },
    });
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new ForbiddenException('Only circle owners and admins can manage webhooks');
    }
  }

  /**
   * Verify user is at least a member of the specified circle.
   */
  private async requireCircleMember(circleId: string, userId: string): Promise<void> {
    const membership = await this.prisma.circleMember.findUnique({
      where: { circleId_userId: { circleId, userId } },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException('You must be a member of this community');
    }
  }

  async create(userId: string, data: { circleId: string; name: string; url: string; events: string[] }) {
    // Verify user is admin/owner of the circle
    await this.requireCircleAdmin(data.circleId, userId);

    await this.validateWebhookUrl(data.url);
    // Validate events against allowed values
    const validatedEvents = data.events.filter(e => WebhooksService.VALID_EVENTS.includes(e as WebhookEvent));
    if (validatedEvents.length === 0) {
      throw new BadRequestException('At least one valid event type is required');
    }
    const secret = randomBytes(32).toString('hex');
    return this.prisma.webhook.create({
      data: {
        circleId: data.circleId,
        name: data.name,
        url: data.url,
        secret,
        events: validatedEvents,
        createdById: userId,
      },
      // Return secret once on creation (user needs it to verify deliveries)
      // But exclude internal fields like token
      select: { id: true, name: true, url: true, events: true, secret: true, isActive: true, createdAt: true },
    });
  }

  async list(circleId: string, userId: string) {
    // Verify user is at least a member of the circle
    await this.requireCircleMember(circleId, userId);
    return this.prisma.webhook.findMany({
      where: { circleId, isActive: true },
      select: { id: true, name: true, url: true, events: true, isActive: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async delete(webhookId: string, userId: string) {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook) throw new NotFoundException('Webhook not found');

    // Allow deletion if: creator OR circle admin/owner
    if (webhook.createdById !== userId) {
      await this.requireCircleAdmin(webhook.circleId, userId);
    }

    return this.prisma.webhook.delete({ where: { id: webhookId } });
  }

  async test(webhookId: string, userId: string) {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook || !webhook.url) throw new NotFoundException('Webhook not found');
    // Authorization: only the webhook creator can trigger test deliveries
    if (webhook.createdById !== userId) throw new NotFoundException('Webhook not found');

    if (!webhook.secret) {
      throw new BadRequestException('Webhook secret is missing — cannot sign delivery');
    }

    const payload = { event: 'test', data: { message: 'Webhook test from Mizanly' }, timestamp: new Date().toISOString() };
    return this.deliver(webhook.url, webhook.secret, payload);
  }

  /**
   * Deliver a webhook payload with HMAC-SHA256 signature.
   * Signature includes timestamp to prevent replay attacks.
   * Retries 3 times with exponential backoff on failure.
   */
  async deliver(url: string, secret: string, payload: Record<string, unknown>): Promise<{ success: boolean; statusCode?: number }> {
    await this.validateWebhookUrl(url);

    if (!secret) {
      this.logger.error('Cannot deliver webhook without a secret — HMAC would be trivially forgeable');
      return { success: false };
    }

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    // Include timestamp in HMAC to prevent replay attacks
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Mizanly-Signature': `sha256=${signature}`,
            'X-Mizanly-Timestamp': timestamp,
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
      take: 100,
    });

    const matching = webhooks.filter(w => w.events.includes(event));
    const payload = { event, data, timestamp: new Date().toISOString() };

    // Filter out webhooks without secrets — HMAC with empty key is predictable
    const deliverable = matching.filter(w => w.secret);

    const results = await Promise.allSettled(
      deliverable.map(async (webhook) => {
        const result = await this.deliver(webhook.url!, webhook.secret!, payload);
        // Only update lastUsedAt on successful delivery
        if (result.success) {
          await this.prisma.webhook.update({
            where: { id: webhook.id },
            data: { lastUsedAt: new Date() },
          });
        }
        return result;
      }),
    );

    return { dispatched: deliverable.length, results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false }) };
  }
}

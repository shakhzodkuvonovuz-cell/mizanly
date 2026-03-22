import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Webhook } from 'svix';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import Redis from 'ioredis';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{ email_address: string }>;
    first_name?: string;
    last_name?: string;
    username?: string;
    image_url?: string;
    [key: string]: unknown;
  };
}

/** Known Clerk event types that we handle or explicitly acknowledge */
const HANDLED_EVENTS = new Set([
  'user.created',
  'user.updated',
  'user.deleted',
]);

const ACKNOWLEDGED_EVENTS = new Set([
  'session.created',
  'session.ended',
  'session.removed',
  'session.revoked',
  'email.created',
  'organization.created',
  'organization.updated',
  'organization.deleted',
]);

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private authService: AuthService,
    private config: ConfigService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  @Post('clerk')
  @Throttle({ default: { limit: 50, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clerk webhook receiver (user.created / updated / deleted)' })
  async handleClerkWebhook(
    @Req() req: RawBodyRequest,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ) {
    const secret = this.config.get<string>('CLERK_WEBHOOK_SECRET');
    if (!secret) {
      throw new BadRequestException('Webhook secret not configured');
    }

    // Verify signature using raw body
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body not available');
    }

    const wh = new Webhook(secret);
    let event: ClerkWebhookEvent;

    try {
      event = wh.verify(rawBody.toString(), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ClerkWebhookEvent;
    } catch (err) {
      this.logger.warn('Invalid Clerk webhook signature');
      throw new BadRequestException('Invalid webhook signature');
    }

    // Idempotency: check if this svix-id has already been processed
    if (svixId) {
      const dedupeKey = `clerk_webhook:${svixId}`;
      const alreadyProcessed = await this.redis.get(dedupeKey);
      if (alreadyProcessed) {
        this.logger.debug(`Clerk webhook ${svixId} already processed — skipping`);
        return { received: true, deduplicated: true };
      }
      // Mark as processed with 24-hour TTL (Clerk retries for up to 3 days, but svix-id is unique per event)
      await this.redis.setex(dedupeKey, 86400, '1');
    }

    const { type, data } = event;
    this.logger.log(`Clerk webhook received: ${type}`);

    if (type === 'user.created' || type === 'user.updated') {
      const email = data.email_addresses?.[0]?.email_address ?? '';
      const firstName = data.first_name ?? '';
      const lastName = data.last_name ?? '';
      const displayName =
        `${firstName} ${lastName}`.trim() || data.username || 'New User';
      const avatarUrl = data.image_url ?? undefined;

      await this.authService.syncClerkUser(data.id, {
        email,
        displayName,
        avatarUrl,
      });
    } else if (type === 'user.deleted') {
      await this.authService.deactivateByClerkId(data.id);
    } else if (ACKNOWLEDGED_EVENTS.has(type)) {
      this.logger.debug(`Clerk webhook acknowledged but no action: ${type}`);
    } else if (!HANDLED_EVENTS.has(type)) {
      this.logger.warn(`Unhandled Clerk webhook event type: ${type}`);
    }

    return { received: true };
  }
}

import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Webhook } from 'svix';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private authService: AuthService,
    private config: ConfigService,
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
    }

    return { received: true };
  }
}

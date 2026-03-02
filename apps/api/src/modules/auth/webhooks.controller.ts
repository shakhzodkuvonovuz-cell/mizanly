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
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { Webhook } from 'svix';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@ApiTags('Webhooks')
@Controller('webhooks')
@SkipThrottle()
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  @Post('clerk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clerk webhook receiver (user.created / updated / deleted)' })
  async handleClerkWebhook(
    @Req() req: Request,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ) {
    const secret = this.config.get<string>('CLERK_WEBHOOK_SECRET');
    if (!secret) {
      throw new BadRequestException('Webhook secret not configured');
    }

    // Verify signature using raw body
    const rawBody = (req as any).rawBody as Buffer;
    if (!rawBody) {
      throw new BadRequestException('Raw body not available');
    }

    const wh = new Webhook(secret);
    let event: { type: string; data: Record<string, any> };

    try {
      event = wh.verify(rawBody.toString(), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as { type: string; data: Record<string, any> };
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

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  InternalServerErrorException,
  Headers,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { PushService } from './push.service';

interface InternalPushBody {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Internal-only endpoint for server-to-server push notifications.
 * Used by the Go livekit-server to notify callees of incoming calls.
 * Auth: X-Internal-Key header must match INTERNAL_SERVICE_KEY env var.
 * NOT exposed to mobile clients — no ClerkAuthGuard.
 */
@ApiTags('Internal')
@Controller('internal')
export class InternalPushController {
  private readonly logger = new Logger(InternalPushController.name);
  private readonly serviceKey: string;

  constructor(
    private pushService: PushService,
    configService: ConfigService,
  ) {
    this.serviceKey = configService.get<string>('INTERNAL_SERVICE_KEY', '');
  }

  @Post('push-to-users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Server-to-server push notification (Go → NestJS)' })
  @ApiExcludeEndpoint()
  async pushToUsers(
    @Headers('x-internal-key') internalKey: string,
    @Body() body: InternalPushBody,
  ) {
    // Validate service key
    if (!this.serviceKey || internalKey !== this.serviceKey) {
      throw new UnauthorizedException('Invalid internal service key');
    }

    if (!body.userIds || body.userIds.length === 0) {
      return { success: true, sent: 0 };
    }

    // Cap at 100 users per request to prevent abuse
    const userIds = body.userIds.slice(0, 100);

    try {
      await this.pushService.sendToUsers(userIds, {
        title: body.title,
        body: body.body,
        data: body.data,
      });

      this.logger.log(`Internal push sent to ${userIds.length} users`);
      return { success: true, sent: userIds.length };
    } catch (err) {
      // [F40 fix] Return HTTP 500 on push failure, not 200 with { success: false }.
      // The Go caller checks HTTP status code, not response body. A 200 would
      // make the Go retry logic think the push succeeded when it didn't.
      this.logger.error('Internal push failed', err);
      throw new InternalServerErrorException('Push delivery failed');
    }
  }
}

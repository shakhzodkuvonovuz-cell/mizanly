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
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { IsArray, IsString, IsOptional, MaxLength, ArrayMaxSize } from 'class-validator';
import { timingSafeEqual, createHmac } from 'crypto';
import { PushService } from './push.service';

class InternalPushDto {
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(100)
  userIds: string[];

  @IsString() @MaxLength(200)
  title: string;

  @IsString() @MaxLength(1000)
  body: string;

  @IsOptional()
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
    if (!this.serviceKey) {
      this.logger.warn(
        'INTERNAL_SERVICE_KEY not set — all internal push requests will be rejected (401). ' +
        'Set this env var to enable Go → NestJS server-to-server push notifications.',
      );
    }
  }

  @Post('push-to-users')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Server-to-server push notification (Go → NestJS)' })
  @ApiExcludeEndpoint()
  async pushToUsers(
    @Headers('x-internal-key') internalKey: string,
    @Body() body: InternalPushDto,
  ) {
    // Timing-safe key comparison to prevent brute-force via timing attack
    if (!this.serviceKey || !internalKey) {
      throw new UnauthorizedException('Invalid internal service key');
    }
    const keyBuf = Buffer.from(this.serviceKey, 'utf8');
    const inputBuf = Buffer.from(internalKey, 'utf8');
    if (keyBuf.length !== inputBuf.length || !timingSafeEqual(keyBuf, inputBuf)) {
      throw new UnauthorizedException('Invalid internal service key');
    }

    if (!body.userIds || body.userIds.length === 0) {
      return { success: true, sent: 0 };
    }

    // Cap at 100 users per request (defense-in-depth, DTO also enforces)
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

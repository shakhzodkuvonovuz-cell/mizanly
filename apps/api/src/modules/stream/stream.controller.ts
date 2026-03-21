import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { StreamService } from './stream.service';
import { createHmac, timingSafeEqual } from 'crypto';

@ApiTags('Stream Webhooks')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('stream')
export class StreamController {
  private readonly logger = new Logger(StreamController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly streamService: StreamService,
    private config: ConfigService,
  ) {
    this.webhookSecret = this.config.get('CF_STREAM_WEBHOOK_SECRET') ?? '';
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Body()
    body: {
      uid: string;
      readyToStream?: boolean;
      status?: { state: string; errorReasonCode?: string };
    },
    @Headers('webhook-signature') signature?: string,
  ) {
    // Always require webhook signature verification
    if (!this.webhookSecret) {
      this.logger.error('CF_STREAM_WEBHOOK_SECRET not configured — rejecting all webhooks');
      throw new UnauthorizedException('Webhook secret not configured');
    }
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }
    this.verifySignature(JSON.stringify(body), signature);

    const streamId = body.uid;
    if (!streamId) {
      this.logger.warn('Webhook received without uid');
      return { received: true };
    }

    if (body.readyToStream) {
      await this.streamService.handleStreamReady(streamId);
    } else if (body.status?.state === 'error') {
      await this.streamService.handleStreamError(
        streamId,
        body.status.errorReasonCode ?? 'unknown',
      );
    }

    return { received: true };
  }

  private verifySignature(payload: string, signature: string) {
    const parts = signature.split(',');
    const timePart = parts.find((p) => p.startsWith('time='));
    const sigPart = parts.find((p) => p.startsWith('sig1='));

    if (!timePart || !sigPart) {
      throw new UnauthorizedException('Invalid webhook signature format');
    }

    const timestamp = timePart.replace('time=', '');
    const expectedSig = sigPart.replace('sig1=', '');

    // Reject signatures older than 5 minutes (replay protection)
    const signatureAge = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
    if (isNaN(signatureAge) || signatureAge > 300) {
      throw new UnauthorizedException('Webhook signature expired');
    }

    const signaturePayload = `${timestamp}.${payload}`;
    const computed = createHmac('sha256', this.webhookSecret)
      .update(signaturePayload)
      .digest('hex');

    if (
      !timingSafeEqual(Buffer.from(computed), Buffer.from(expectedSig))
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}

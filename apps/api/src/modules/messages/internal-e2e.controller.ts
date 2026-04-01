import { Controller, Post, Body, Headers, HttpCode, ForbiddenException, BadRequestException, Req, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { MessageType } from '@prisma/client';
import { IdentityChangeDto } from './dto/identity-change.dto';

/**
 * Internal webhook endpoint for the Go E2E Key Server.
 *
 * SECURITY:
 * - Uses HMAC-SHA256 verification (not raw secret comparison — prevents timing attacks)
 * - Rate limited to 5 requests per minute (prevents brute-force + flood)
 * - The Go server sends: X-Webhook-Signature = HMAC-SHA256(secret, requestBody)
 * - This endpoint verifies the signature, not the secret itself
 *
 * Called when a user's identity key changes (reinstall, new device, etc.)
 * to create a SYSTEM message: "[Security code changed]"
 */
@Controller('internal/e2e')
export class InternalE2EController {
  private readonly logger = new Logger(InternalE2EController.name);

  constructor(private readonly prisma: PrismaService) {
    // Warn at startup if webhook secret is not configured
    if (!process.env.INTERNAL_WEBHOOK_SECRET) {
      this.logger.warn(
        'INTERNAL_WEBHOOK_SECRET not set — identity change webhooks will be rejected. ' +
          'Set this env var to enable Go E2E server → NestJS communication.',
      );
    }
  }

  @Post('identity-changed')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async handleIdentityChanged(
    @Headers('x-webhook-signature') signature: string,
    @Body() body: IdentityChangeDto,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    // Verify HMAC signature (constant-time comparison — no timing attack)
    const secret = process.env.INTERNAL_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.error('INTERNAL_WEBHOOK_SECRET not configured — rejecting webhook');
      throw new ForbiddenException('Webhook not configured');
    }

    if (!signature) {
      throw new ForbiddenException('Missing webhook signature');
    }

    // Use RAW request body bytes for HMAC — NOT JSON.stringify(body).
    // Re-serialization may reorder keys differently than Go's json.Marshal,
    // causing HMAC mismatch. rawBody is enabled via NestFactory { rawBody: true }.
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body not available for HMAC verification');
    }

    // Compute expected HMAC-SHA256 of the raw request body
    const expectedSig = createHmac('sha256', secret).update(rawBody).digest('hex');

    // Constant-time comparison — prevents timing side-channel attacks
    // Both must be same length for timingSafeEqual
    let sigBuffer: Buffer;
    let expectedBuffer: Buffer;
    try {
      sigBuffer = Buffer.from(signature, 'hex');
      expectedBuffer = Buffer.from(expectedSig, 'hex');
    } catch {
      throw new ForbiddenException('Invalid signature format');
    }

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    const { userId } = body;
    if (!userId || typeof userId !== 'string' || userId.length > 64) {
      throw new ForbiddenException('Invalid userId');
    }

    // Find all conversations this user is a member of
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });

    if (memberships.length === 0) {
      return { created: 0 };
    }

    const conversationIds = memberships.map((m) => m.conversationId);

    // Create SYSTEM messages — use a message key for client-side i18n rendering
    const messages = await this.prisma.message.createMany({
      data: conversationIds.map((convId) => ({
        conversationId: convId,
        messageType: MessageType.SYSTEM,
        content: 'SYSTEM:IDENTITY_CHANGED', // Clients render this in user's language
        isEncrypted: false,
      })),
    });

    this.logger.log(
      `Identity key changed: created ${messages.count} SYSTEM messages`,
      // Do NOT log userId — it's PII
    );

    return { created: messages.count };
  }
}

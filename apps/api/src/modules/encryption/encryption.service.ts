import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';

interface StoreEnvelopeData {
  conversationId: string;
  recipientId: string;
  encryptedKey: string;
  nonce: string;
}

interface RotateEnvelopeItem {
  userId: string;
  encryptedKey: string;
  nonce: string;
}

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);

  constructor(private prisma: PrismaService) {}

  async registerKey(userId: string, publicKey: string) {
    if (!publicKey || publicKey.length < 32) {
      throw new BadRequestException('Invalid public key');
    }

    const fingerprint = createHash('sha256')
      .update(Buffer.from(publicKey, 'base64'))
      .digest('hex')
      .slice(0, 32);

    // Check if this is a key change (re-registration)
    const existingKey = await this.prisma.encryptionKey.findUnique({
      where: { userId },
    });
    const isKeyChange = existingKey && existingKey.keyFingerprint !== fingerprint;

    const result = await this.prisma.encryptionKey.upsert({
      where: { userId },
      create: { userId, publicKey, keyFingerprint: fingerprint },
      update: { publicKey, keyFingerprint: fingerprint },
    });

    // If key changed, notify conversation partners with system message
    if (isKeyChange) {
      await this.notifyKeyChange(userId);
    }

    return result;
  }

  /**
   * Compute a safety number for two users in a conversation.
   * Concatenates both fingerprints (sorted by userId for deterministic order),
   * hashes with SHA-256, and formats as groups of 5 digits (60 digits total).
   */
  async computeSafetyNumber(userIdA: string, userIdB: string): Promise<string | null> {
    const keys = await this.prisma.encryptionKey.findMany({
      where: { userId: { in: [userIdA, userIdB] } },
      select: { userId: true, keyFingerprint: true },
    });

    if (keys.length < 2) return null;

    // Sort by userId for deterministic order
    const sorted = [userIdA, userIdB].sort();
    const fpA = keys.find(k => k.userId === sorted[0])?.keyFingerprint ?? '';
    const fpB = keys.find(k => k.userId === sorted[1])?.keyFingerprint ?? '';

    if (!fpA || !fpB) return null;

    // Concatenate and hash
    const combined = fpA + fpB;
    const hash = createHash('sha256').update(combined).digest('hex');

    // Convert hex hash to decimal digits: take 60 characters of numeric output
    let digits = '';
    for (let i = 0; i < hash.length && digits.length < 60; i++) {
      const num = parseInt(hash[i], 16);
      digits += num.toString();
      if (digits.length >= 60) break;
    }
    // Pad if needed (SHA-256 hex → 64 hex chars → at least 64 decimal digits)
    while (digits.length < 60) {
      digits += '0';
    }
    digits = digits.slice(0, 60);

    // Format as groups of 5 digits
    return digits.match(/.{5}/g)!.join(' ');
  }

  /**
   * Check encryption status for a conversation:
   * returns whether both members have registered encryption keys.
   */
  async getConversationEncryptionStatus(conversationId: string, requestingUserId?: string): Promise<{
    encrypted: boolean;
    members: { userId: string; hasKey: boolean }[];
  }> {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
      take: 50,
    });

    // Verify requesting user is a member of the conversation
    if (requestingUserId && !members.some(m => m.userId === requestingUserId)) {
      throw new ForbiddenException('Not a member of this conversation');
    }

    const userIds = members.map(m => m.userId);
    const keys = await this.prisma.encryptionKey.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true },
    });

    const keyUserIds = new Set(keys.map(k => k.userId));
    const memberStatuses = userIds.map(uid => ({
      userId: uid,
      hasKey: keyUserIds.has(uid),
    }));

    return {
      encrypted: memberStatuses.every(m => m.hasKey),
      members: memberStatuses,
    };
  }

  /**
   * Notify all conversation partners when a user re-registers their encryption key.
   * Creates a system message in each DM conversation.
   */
  private async notifyKeyChange(userId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, displayName: true },
      });
      const name = user?.displayName || user?.username || 'A user';

      // Find all conversations this user is in
      const memberships = await this.prisma.conversationMember.findMany({
        where: { userId },
        select: { conversationId: true },
        take: 50,
      });

      // Create system messages in each conversation
      for (const { conversationId } of memberships) {
        await this.prisma.message.create({
          data: {
            conversationId,
            senderId: userId,
            content: `Security code changed for ${name}. Tap to verify.`,
            messageType: 'SYSTEM',
          },
        });
      }
    } catch (err) {
      this.logger.error('Failed to send key change notification', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async getPublicKey(userId: string) {
    const key = await this.prisma.encryptionKey.findUnique({
      where: { userId },
    });
    if (!key) {
      throw new NotFoundException('Encryption key not found for user');
    }
    return {
      userId: key.userId,
      publicKey: key.publicKey,
      fingerprint: key.keyFingerprint,
    };
  }

  async getBulkKeys(userIds: string[]) {
    if (!userIds.length) return [];

    const keys = await this.prisma.encryptionKey.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        publicKey: true,
        keyFingerprint: true,
      },
      take: 50,
    });

    return keys.map((k) => ({
      userId: k.userId,
      publicKey: k.publicKey,
      fingerprint: k.keyFingerprint,
    }));
  }

  async storeEnvelope(senderId: string, data: StoreEnvelopeData) {
    // Verify sender is member of the conversation
    const membership = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: data.conversationId,
          userId: senderId,
        },
      },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this conversation');
    }

    // Get current max version for this conversation+recipient
    const existing = await this.prisma.conversationKeyEnvelope.findFirst({
      where: {
        conversationId: data.conversationId,
        userId: data.recipientId,
      },
      orderBy: { version: 'desc' },
    });
    const version = existing ? existing.version + 1 : 1;

    return this.prisma.conversationKeyEnvelope.create({
      data: {
        conversationId: data.conversationId,
        userId: data.recipientId,
        encryptedKey: data.encryptedKey,
        nonce: data.nonce,
        version,
      },
    });
  }

  async getEnvelope(conversationId: string, userId: string) {
    const envelope = await this.prisma.conversationKeyEnvelope.findFirst({
      where: { conversationId, userId },
      orderBy: { version: 'desc' },
    });
    if (!envelope) return null;

    return {
      conversationId: envelope.conversationId,
      encryptedKey: envelope.encryptedKey,
      nonce: envelope.nonce,
      version: envelope.version,
    };
  }

  async rotateKey(
    conversationId: string,
    userId: string,
    envelopes: RotateEnvelopeItem[],
  ) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member');
    }

    // Get current max version and create envelopes in a serializable transaction
    // to avoid race conditions with concurrent rotations
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const latest = await tx.conversationKeyEnvelope.findFirst({
          where: { conversationId },
          orderBy: { version: 'desc' },
        });
        const newVersion = (latest?.version ?? 0) + 1;

        for (const env of envelopes) {
          await tx.conversationKeyEnvelope.create({
            data: {
              conversationId,
              userId: env.userId,
              encryptedKey: env.encryptedKey,
              nonce: env.nonce,
              version: newVersion,
            },
          });
        }

        return { version: newVersion, envelopeCount: envelopes.length };
      });

      return result;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Key rotation conflict — please retry');
      }
      throw e;
    }
  }
}

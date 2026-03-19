import {
  Injectable,
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
  constructor(private prisma: PrismaService) {}

  async registerKey(userId: string, publicKey: string) {
    if (!publicKey || publicKey.length < 32) {
      throw new BadRequestException('Invalid public key');
    }

    const fingerprint = createHash('sha256')
      .update(Buffer.from(publicKey, 'base64'))
      .digest('hex')
      .slice(0, 32);

    return this.prisma.encryptionKey.upsert({
      where: { userId },
      create: { userId, publicKey, keyFingerprint: fingerprint },
      update: { publicKey, keyFingerprint: fingerprint },
    });
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
    const version = existing ? existing.version : 1;

    return this.prisma.conversationKeyEnvelope.upsert({
      where: {
        conversationId_userId_version: {
          conversationId: data.conversationId,
          userId: data.recipientId,
          version,
        },
      },
      create: {
        conversationId: data.conversationId,
        userId: data.recipientId,
        encryptedKey: data.encryptedKey,
        nonce: data.nonce,
        version,
      },
      update: {
        encryptedKey: data.encryptedKey,
        nonce: data.nonce,
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

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { InternalE2EController } from './internal-e2e.controller';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { createHmac } from 'crypto';

describe('InternalE2EController', () => {
  let controller: InternalE2EController;
  let prisma: Record<string, any>;
  const WEBHOOK_SECRET = 'test-webhook-secret-123';

  function makeSignature(rawBody: Buffer): string {
    return createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  }

  function makeRequest(rawBody: Buffer) {
    return { rawBody } as any;
  }

  beforeEach(async () => {
    process.env.INTERNAL_WEBHOOK_SECRET = WEBHOOK_SECRET;

    prisma = {
      conversationMember: {
        findMany: jest.fn(),
      },
      message: {
        createMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalE2EController],
      providers: [
        ...globalMockProviders,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get(InternalE2EController);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.INTERNAL_WEBHOOK_SECRET;
  });

  describe('handleIdentityChanged', () => {
    it('should create SYSTEM messages in all conversations for the user', async () => {
      const body = { userId: 'user-1', newFingerprint: 'abc123' };
      const rawBody = Buffer.from(JSON.stringify(body));
      const signature = makeSignature(rawBody);

      prisma.conversationMember.findMany.mockResolvedValue([
        { conversationId: 'conv-1' },
        { conversationId: 'conv-2' },
      ]);
      prisma.message.createMany.mockResolvedValue({ count: 2 });

      const result = await controller.handleIdentityChanged(signature, body as any, makeRequest(rawBody));

      expect(prisma.conversationMember.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { conversationId: true },
      });
      expect(prisma.message.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ conversationId: 'conv-1', content: 'SYSTEM:IDENTITY_CHANGED' }),
          expect.objectContaining({ conversationId: 'conv-2', content: 'SYSTEM:IDENTITY_CHANGED' }),
        ]),
      });
      expect(result).toEqual({ created: 2 });
    });

    it('should return { created: 0 } when user has no conversations', async () => {
      const body = { userId: 'user-lonely', newFingerprint: 'abc' };
      const rawBody = Buffer.from(JSON.stringify(body));
      const signature = makeSignature(rawBody);

      prisma.conversationMember.findMany.mockResolvedValue([]);

      const result = await controller.handleIdentityChanged(signature, body as any, makeRequest(rawBody));

      expect(result).toEqual({ created: 0 });
      expect(prisma.message.createMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when INTERNAL_WEBHOOK_SECRET is not set', async () => {
      delete process.env.INTERNAL_WEBHOOK_SECRET;
      // Need to recreate controller without the secret
      const module = await Test.createTestingModule({
        controllers: [InternalE2EController],
        providers: [
          ...globalMockProviders,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();
      const ctrl = module.get(InternalE2EController);

      const body = { userId: 'user-1', newFingerprint: 'abc' };
      const rawBody = Buffer.from(JSON.stringify(body));

      await expect(
        ctrl.handleIdentityChanged('some-sig', body as any, makeRequest(rawBody)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when signature is missing', async () => {
      const body = { userId: 'user-1', newFingerprint: 'abc' };
      const rawBody = Buffer.from(JSON.stringify(body));

      await expect(
        controller.handleIdentityChanged('', body as any, makeRequest(rawBody)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when signature is invalid', async () => {
      const body = { userId: 'user-1', newFingerprint: 'abc' };
      const rawBody = Buffer.from(JSON.stringify(body));
      const badSig = 'a'.repeat(64); // valid hex length but wrong HMAC

      await expect(
        controller.handleIdentityChanged(badSig, body as any, makeRequest(rawBody)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when rawBody is not available', async () => {
      const body = { userId: 'user-1', newFingerprint: 'abc' };

      await expect(
        controller.handleIdentityChanged('some-sig', body as any, { rawBody: undefined } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException for invalid signature format (non-hex)', async () => {
      const body = { userId: 'user-1', newFingerprint: 'abc' };
      const rawBody = Buffer.from(JSON.stringify(body));

      await expect(
        controller.handleIdentityChanged('not-valid-hex!!!', body as any, makeRequest(rawBody)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for invalid userId', async () => {
      const body = { userId: '', newFingerprint: 'abc' };
      const rawBody = Buffer.from(JSON.stringify(body));
      const signature = makeSignature(rawBody);

      await expect(
        controller.handleIdentityChanged(signature, body as any, makeRequest(rawBody)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for userId exceeding max length', async () => {
      const body = { userId: 'x'.repeat(65), newFingerprint: 'abc' };
      const rawBody = Buffer.from(JSON.stringify(body));
      const signature = makeSignature(rawBody);

      await expect(
        controller.handleIdentityChanged(signature, body as any, makeRequest(rawBody)),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

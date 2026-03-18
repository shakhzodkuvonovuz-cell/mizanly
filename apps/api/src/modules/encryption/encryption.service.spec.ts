import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { EncryptionService } from './encryption.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('EncryptionService', () => {
  let service: EncryptionService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        EncryptionService,
        {
          provide: PrismaService,
          useValue: {
            encryptionKey: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
            conversationMember: { findUnique: jest.fn().mockResolvedValue({ userId: 'u1' }) },
            conversationKeyEnvelope: { findFirst: jest.fn(), upsert: jest.fn(), create: jest.fn() },
            $transaction: jest.fn().mockImplementation((fn: (tx: any) => Promise<unknown>) => fn({
              conversationKeyEnvelope: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
            })),
          },
        },
      ],
    }).compile();
    service = module.get(EncryptionService);
    prisma = module.get(PrismaService) as any;
  });

  describe('registerKey', () => {
    it('should register public key with fingerprint', async () => {
      const publicKey = 'dGVzdEtleURhdGFGb3JFbmNyeXB0aW9uUHVycG9zZXM='; // base64 >= 32 chars
      prisma.encryptionKey.upsert.mockResolvedValue({ userId: 'u1', publicKey, keyFingerprint: 'abc' });
      const result = await service.registerKey('u1', publicKey);
      expect(result.userId).toBe('u1');
    });

    it('should throw for short key', async () => {
      await expect(service.registerKey('u1', 'short')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getPublicKey', () => {
    it('should return public key', async () => {
      prisma.encryptionKey.findUnique.mockResolvedValue({ userId: 'u1', publicKey: 'pk', keyFingerprint: 'fp' });
      const result = await service.getPublicKey('u1');
      expect(result.publicKey).toBe('pk');
      expect(result.fingerprint).toBe('fp');
    });

    it('should throw NotFoundException', async () => {
      prisma.encryptionKey.findUnique.mockResolvedValue(null);
      await expect(service.getPublicKey('u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBulkKeys', () => {
    it('should return keys for multiple users', async () => {
      prisma.encryptionKey.findMany.mockResolvedValue([
        { userId: 'u1', publicKey: 'pk1', keyFingerprint: 'fp1' },
        { userId: 'u2', publicKey: 'pk2', keyFingerprint: 'fp2' },
      ]);
      const result = await service.getBulkKeys(['u1', 'u2']);
      expect(result).toHaveLength(2);
    });

    it('should return empty for empty input', async () => {
      const result = await service.getBulkKeys([]);
      expect(result).toEqual([]);
    });
  });

  describe('storeEnvelope', () => {
    it('should store key envelope', async () => {
      prisma.conversationKeyEnvelope.findFirst.mockResolvedValue(null);
      prisma.conversationKeyEnvelope.upsert.mockResolvedValue({ conversationId: 'c1', userId: 'u2' });
      const result = await service.storeEnvelope('u1', {
        conversationId: 'c1', recipientId: 'u2', encryptedKey: 'ek', nonce: 'n',
      });
      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException if not member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.storeEnvelope('u1', {
        conversationId: 'c1', recipientId: 'u2', encryptedKey: 'ek', nonce: 'n',
      })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getEnvelope', () => {
    it('should return latest envelope', async () => {
      prisma.conversationKeyEnvelope.findFirst.mockResolvedValue({
        conversationId: 'c1', encryptedKey: 'ek', nonce: 'n', version: 1,
      });
      const result = await service.getEnvelope('c1', 'u1');
      expect(result!.encryptedKey).toBe('ek');
    });

    it('should return null if no envelope', async () => {
      prisma.conversationKeyEnvelope.findFirst.mockResolvedValue(null);
      const result = await service.getEnvelope('c1', 'u1');
      expect(result).toBeNull();
    });
  });

  describe('rotateKey', () => {
    it('should create new version envelopes', async () => {
      const result = await service.rotateKey('c1', 'u1', [
        { userId: 'u1', encryptedKey: 'ek1', nonce: 'n1' },
        { userId: 'u2', encryptedKey: 'ek2', nonce: 'n2' },
      ]);
      expect(result.version).toBe(1);
      expect(result.envelopeCount).toBe(2);
    });

    it('should throw ForbiddenException if not member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.rotateKey('c1', 'u1', [])).rejects.toThrow(ForbiddenException);
    });
  });
});

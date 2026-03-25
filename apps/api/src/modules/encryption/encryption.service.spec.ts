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
            conversationMember: { findUnique: jest.fn().mockResolvedValue({ userId: 'u1' }), findMany: jest.fn().mockResolvedValue([]) },
            conversationKeyEnvelope: { findFirst: jest.fn(), upsert: jest.fn(), create: jest.fn() },
            $transaction: jest.fn().mockImplementation((fn: (tx: any) => Promise<unknown>) => fn({
              conversationKeyEnvelope: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({ conversationId: 'c1', userId: 'u2', version: 1 }),
              },
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
    it('should store key envelope with new version', async () => {
      prisma.conversationKeyEnvelope.findFirst.mockResolvedValue(null);
      prisma.conversationKeyEnvelope.create.mockResolvedValue({ conversationId: 'c1', userId: 'u2', version: 1 });
      const result = await service.storeEnvelope('u1', {
        conversationId: 'c1', recipientId: 'u2', encryptedKey: 'ek', nonce: 'n',
      });
      expect(result).toBeDefined();
      expect(result).toHaveProperty('version', 1);
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

  describe('computeSafetyNumber', () => {
    it('should return 60-digit safety number when both users have keys', async () => {
      prisma.encryptionKey.findMany.mockResolvedValue([
        { userId: 'user-a', keyFingerprint: 'abc123def456' },
        { userId: 'user-b', keyFingerprint: 'xyz789ghi012' },
      ]);

      const result = await service.computeSafetyNumber('user-a', 'user-b');
      expect(result).not.toBeNull();
      // Should be 60 digits in groups of 5
      const digits = result!.replace(/ /g, '');
      expect(digits).toHaveLength(60);
      expect(digits).toMatch(/^\d+$/);
    });

    it('should return null when one user has no key', async () => {
      prisma.encryptionKey.findMany.mockResolvedValue([
        { userId: 'user-a', keyFingerprint: 'abc123def456' },
      ]);

      const result = await service.computeSafetyNumber('user-a', 'user-b');
      expect(result).toBeNull();
    });

    it('should be deterministic regardless of argument order', async () => {
      const keys = [
        { userId: 'user-a', keyFingerprint: 'abc123def456' },
        { userId: 'user-b', keyFingerprint: 'xyz789ghi012' },
      ];
      prisma.encryptionKey.findMany.mockResolvedValue(keys);
      const result1 = await service.computeSafetyNumber('user-a', 'user-b');

      prisma.encryptionKey.findMany.mockResolvedValue(keys);
      const result2 = await service.computeSafetyNumber('user-b', 'user-a');

      expect(result1).toBe(result2);
    });
  });

  describe('getConversationEncryptionStatus', () => {
    it('should return encrypted=true when all members have keys', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([
        { userId: 'user-a' },
        { userId: 'user-b' },
      ]);
      prisma.encryptionKey.findMany.mockResolvedValue([
        { userId: 'user-a' },
        { userId: 'user-b' },
      ]);

      const result = await service.getConversationEncryptionStatus('conv-1');
      expect(result.encrypted).toBe(true);
      expect(result.members).toHaveLength(2);
      expect(result.members.every(m => m.hasKey)).toBe(true);
    });

    it('should return encrypted=false when one member lacks key', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([
        { userId: 'user-a' },
        { userId: 'user-b' },
      ]);
      prisma.encryptionKey.findMany.mockResolvedValue([
        { userId: 'user-a' },
      ]);

      const result = await service.getConversationEncryptionStatus('conv-1');
      expect(result.encrypted).toBe(false);
      const userB = result.members.find(m => m.userId === 'user-b');
      expect(userB?.hasKey).toBe(false);
    });
  });
});

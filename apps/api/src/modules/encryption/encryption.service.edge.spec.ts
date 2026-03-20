import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { EncryptionService } from './encryption.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('EncryptionService — edge cases', () => {
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
            encryptionKey: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              upsert: jest.fn(),
            },
            conversationKeyEnvelope: {
              findFirst: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn(),
            },
            conversationMember: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            message: { create: jest.fn() },
            conversation: { findUnique: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
    prisma = module.get(PrismaService);
  });

  describe('registerKey — edge cases', () => {
    it('should reject empty public key', async () => {
      await expect(service.registerKey('user-1', ''))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject key shorter than 32 chars', async () => {
      await expect(service.registerKey('user-1', 'short'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getPublicKey — edge cases', () => {
    it('should throw NotFoundException for non-existent user', async () => {
      prisma.encryptionKey.findUnique.mockResolvedValue(null);

      await expect(service.getPublicKey('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getBulkKeys — edge cases', () => {
    it('should return empty array for empty userId list', async () => {
      const result = await service.getBulkKeys([]);
      expect(result).toEqual([]);
    });
  });

  describe('computeSafetyNumber — edge cases', () => {
    it('should return null when one user has no key', async () => {
      prisma.encryptionKey.findMany.mockResolvedValue([
        { userId: 'user-a', keyFingerprint: 'abc123' },
      ]);

      const result = await service.computeSafetyNumber('user-a', 'user-b');
      expect(result).toBeNull();
    });

    it('should handle same user twice (degenerate case)', async () => {
      prisma.encryptionKey.findMany.mockResolvedValue([
        { userId: 'user-a', keyFingerprint: 'abc123' },
      ]);

      const result = await service.computeSafetyNumber('user-a', 'user-a');
      // Only one key found, returns null
      expect(result).toBeNull();
    });
  });
});

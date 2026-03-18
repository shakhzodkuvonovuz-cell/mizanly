import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PrivacyService } from './privacy.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PrivacyService', () => {
  let service: PrivacyService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PrivacyService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn(), update: jest.fn() },
            post: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
            thread: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
            story: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            message: { findMany: jest.fn().mockResolvedValue([]) },
            follow: { findMany: jest.fn().mockResolvedValue([]) },
            comment: { updateMany: jest.fn() },
            profileLink: { deleteMany: jest.fn() },
            $transaction: jest.fn().mockImplementation((fn: (tx: any) => Promise<void>) => fn({
              user: { update: jest.fn() },
              post: { updateMany: jest.fn() },
              thread: { updateMany: jest.fn() },
              comment: { updateMany: jest.fn() },
              story: { deleteMany: jest.fn() },
              profileLink: { deleteMany: jest.fn() },
            })),
          },
        },
      ],
    }).compile();
    service = module.get(PrivacyService);
    prisma = module.get(PrismaService) as any;
  });

  describe('exportUserData', () => {
    it('should return user data export', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'user1', profileLinks: [], channel: null });
      const result = await service.exportUserData('u1');
      expect(result.profile).toBeDefined();
      expect(result.posts).toBeDefined();
      expect(result.threads).toBeDefined();
      expect(result.stories).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.following).toBeDefined();
      expect(result.exportedAt).toBeDefined();
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.exportUserData('u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteAllUserData', () => {
    it('should soft-delete user data', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isDeleted: false });
      const result = await service.deleteAllUserData('u1');
      expect(result.deleted).toBe(true);
      expect(result.userId).toBe('u1');
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.deleteAllUserData('u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if already deleted', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isDeleted: true });
      await expect(service.deleteAllUserData('u1')).rejects.toThrow(NotFoundException);
    });
  });
});

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
            reel: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
            video: { updateMany: jest.fn() },
            message: { findMany: jest.fn().mockResolvedValue([]) },
            follow: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            comment: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
            postReaction: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            profileLink: { deleteMany: jest.fn() },
            twoFactorSecret: { deleteMany: jest.fn() },
            encryptionKey: { deleteMany: jest.fn() },
            device: { deleteMany: jest.fn() },
            block: { deleteMany: jest.fn() },
            bookmark: { deleteMany: jest.fn() },
            $transaction: jest.fn().mockImplementation((fn: (tx: any) => Promise<void>) => fn({
              user: { update: jest.fn() },
              post: { updateMany: jest.fn() },
              thread: { updateMany: jest.fn() },
              comment: { updateMany: jest.fn() },
              reel: { updateMany: jest.fn() },
              video: { updateMany: jest.fn() },
              story: { deleteMany: jest.fn() },
              profileLink: { deleteMany: jest.fn() },
              twoFactorSecret: { deleteMany: jest.fn() },
              encryptionKey: { deleteMany: jest.fn() },
              device: { deleteMany: jest.fn() },
              follow: { deleteMany: jest.fn() },
              block: { deleteMany: jest.fn() },
              bookmark: { deleteMany: jest.fn() },
              postReaction: { deleteMany: jest.fn() },
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
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'user1', profileLinks: [] });
      const result = await service.exportUserData('u1');
      expect(result.profile).toBeDefined();
      expect(result.posts).toBeDefined();
      expect(result.threads).toBeDefined();
      expect(result.stories).toBeDefined();
      expect(result.reels).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.comments).toBeDefined();
      expect(result.reactions).toBeDefined();
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

    it('should call $transaction for soft-delete', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isDeleted: false });
      await service.deleteAllUserData('u1');
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('exportUserData — with data', () => {
    it('should include posts, threads, stories in export', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'user1', profileLinks: [], channel: null });
      prisma.post.findMany.mockResolvedValue([{ id: 'p1', content: 'hello', mediaUrls: [], createdAt: new Date() }]);
      prisma.thread.findMany.mockResolvedValue([{ id: 't1', content: 'thread', createdAt: new Date() }]);
      prisma.story.findMany.mockResolvedValue([{ id: 's1', mediaUrl: 'url', createdAt: new Date() }]);
      prisma.message.findMany.mockResolvedValue([{ id: 'm1', content: 'msg', createdAt: new Date() }]);
      prisma.follow.findMany.mockResolvedValue([{ followingId: 'f1' }, { followingId: 'f2' }]);

      const result = await service.exportUserData('u1');
      expect(result.posts).toHaveLength(1);
      expect(result.threads).toHaveLength(1);
      expect(result.stories).toHaveLength(1);
      expect(result.messages.count).toBe(1);
      expect(result.following).toEqual(['f1', 'f2']);
    });

    it('should return empty arrays when user has no content', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'empty', profileLinks: [], channel: null });
      const result = await service.exportUserData('u1');
      expect(result.posts).toEqual([]);
      expect(result.threads).toEqual([]);
      expect(result.stories).toEqual([]);
      expect(result.messages.count).toBe(0);
      expect(result.following).toEqual([]);
    });

    it('should include exportedAt timestamp', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'user1', profileLinks: [], channel: null });
      const result = await service.exportUserData('u1');
      expect(result.exportedAt).toBeDefined();
      expect(typeof result.exportedAt).toBe('string');
    });
  });
});

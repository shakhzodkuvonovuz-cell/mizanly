import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../config/prisma.service';
import { PrivacyService } from '../privacy/privacy.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PublishWorkflowService } from '../../common/services/publish-workflow.service';
import { QueueService } from '../../common/queue/queue.service';

describe('UsersService — audit fixes', () => {
  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      post: { findMany: jest.fn().mockResolvedValue([]) },
      thread: { findMany: jest.fn().mockResolvedValue([]) },
      block: { findFirst: jest.fn().mockResolvedValue(null) },
      follow: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      postReaction: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const redis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: PrivacyService, useValue: {} },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: PublishWorkflowService, useValue: { onPublish: jest.fn().mockResolvedValue(undefined) } },
        { provide: QueueService, useValue: { addSearchIndexJob: jest.fn().mockResolvedValue(undefined) } },
        { provide: 'REDIS', useValue: redis },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('getUserPosts — banned user check (B01-#1)', () => {
    it('should throw NotFoundException for banned user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user1', isBanned: true, isDeleted: false, isDeactivated: false, isPrivate: false,
      });

      await expect(service.getUserPosts('banneduser')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for deactivated user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user1', isBanned: false, isDeleted: false, isDeactivated: true, isPrivate: false,
      });

      await expect(service.getUserPosts('deactivateduser')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for deleted user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user1', isBanned: false, isDeleted: true, isDeactivated: false, isPrivate: false,
      });

      await expect(service.getUserPosts('deleteduser')).rejects.toThrow(NotFoundException);
    });

    it('should return posts for active user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user1', isBanned: false, isDeleted: false, isDeactivated: false, isPrivate: false,
      });
      prisma.post.findMany.mockResolvedValue([{ id: 'post1' }]);

      const result = await service.getUserPosts('activeuser');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getUserThreads — banned user check (B01-#2)', () => {
    it('should throw NotFoundException for banned user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user1', isBanned: true, isDeleted: false, isDeactivated: false, isPrivate: false,
      });

      await expect(service.getUserThreads('banneduser')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLikedPosts — removed post filter (B01-#15)', () => {
    it('should include isRemoved filter in query', async () => {
      prisma.postReaction.findMany.mockResolvedValue([]);

      await service.getLikedPosts('user1');

      expect(prisma.postReaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            post: { isRemoved: false },
          }),
        }),
      );
    });
  });
});

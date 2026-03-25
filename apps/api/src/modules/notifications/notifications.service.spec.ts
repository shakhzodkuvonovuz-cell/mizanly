import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { PushTriggerService } from './push-trigger.service';
import { NotificationsService } from './notifications.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;
  let devices: any;
  let pushTrigger: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        NotificationsService,
        {
          provide: PrismaService,
          useValue: {
            notification: {
              findMany: jest.fn(),
              findFirst: jest.fn().mockResolvedValue(null),
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
              create: jest.fn(),
              count: jest.fn(),
            },
            follow: { findMany: jest.fn().mockResolvedValue([]) },
            block: { findFirst: jest.fn().mockResolvedValue(null) },
            mute: { findFirst: jest.fn().mockResolvedValue(null) },
            userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
            user: { findUnique: jest.fn().mockResolvedValue({ notificationsOn: true }) },
          },
        },
        {
          provide: DevicesService,
          useValue: {
            getActiveTokensForUser: jest.fn(),
          },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockReturnValue({ catch: jest.fn() }),
            publish: jest.fn().mockReturnValue({ catch: jest.fn() }),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get(PrismaService);
    devices = module.get(DevicesService);
    pushTrigger = module.get(PushTriggerService);
  });

  describe('getNotifications', () => {
    it('should return paginated notifications for user', async () => {
      const userId = 'user-123';
      const mockNotifications = [
        {
          id: 'notif-1',
          userId,
          actorId: 'actor-1',
          type: 'LIKE',
          isRead: false,
          createdAt: new Date(),
          actor: {
            id: 'actor-1',
            username: 'actor1',
            displayName: 'Actor One',
            avatarUrl: 'https://example.com/avatar.jpg',
            isVerified: false,
          },
          post: null,
          reel: null,
          thread: null,
          video: null,
        },
      ];
      prisma.notification.findMany.mockResolvedValue(mockNotifications);
      prisma.follow.findMany.mockResolvedValue([]);

      const result = await service.getNotifications(userId);

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: {
          actor: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              isVerified: true,
            },
          },
          // Conditional content includes — all 4 relations for unfiltered queries
          post: { select: { id: true, thumbnailUrl: true, mediaUrls: true } },
          reel: { select: { id: true, thumbnailUrl: true } },
          thread: { select: { id: true, mediaUrls: true } },
          video: { select: { id: true, thumbnailUrl: true } },
        },
        take: 31,
        orderBy: { createdAt: 'desc' },
      });
      // Actor should be enriched with isFollowing: false
      expect(result.data[0].actor).toEqual({
        ...mockNotifications[0].actor,
        isFollowing: false,
      });
      expect(result.meta.hasMore).toBe(false);
    });

    it('should enrich actor with isFollowing: true when user follows them', async () => {
      const userId = 'user-123';
      const mockNotifications = [
        {
          id: 'notif-1',
          userId,
          actorId: 'actor-1',
          type: 'FOLLOW',
          isRead: false,
          createdAt: new Date(),
          actor: {
            id: 'actor-1',
            username: 'actor1',
            displayName: 'Actor One',
            avatarUrl: null,
            isVerified: false,
          },
          post: null,
          reel: null,
          thread: null,
          video: null,
        },
      ];
      prisma.notification.findMany.mockResolvedValue(mockNotifications);
      prisma.follow.findMany.mockResolvedValue([{ followingId: 'actor-1' }]);

      const result = await service.getNotifications(userId);

      expect(result.data[0].actor).toEqual(
        expect.objectContaining({ isFollowing: true }),
      );
    });

    it('should apply mentions filter', async () => {
      const userId = 'user-123';
      prisma.notification.findMany.mockResolvedValue([]);

      await service.getNotifications(userId, 'mentions');

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          type: { in: ['MENTION', 'THREAD_REPLY', 'REPLY'] },
        },
        include: expect.any(Object),
        take: 31,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should only include post/thread relations for mentions filter (no reel/video)', async () => {
      const userId = 'user-123';
      prisma.notification.findMany.mockResolvedValue([]);

      await service.getNotifications(userId, 'mentions');

      const callArgs = prisma.notification.findMany.mock.calls[0][0];
      expect(callArgs.include.post).toBeDefined();
      expect(callArgs.include.thread).toBeDefined();
      expect(callArgs.include.reel).toBeUndefined();
      expect(callArgs.include.video).toBeUndefined();
    });

    it('should include all content relations for "all" filter', async () => {
      const userId = 'user-123';
      prisma.notification.findMany.mockResolvedValue([]);

      await service.getNotifications(userId, 'all');

      const callArgs = prisma.notification.findMany.mock.calls[0][0];
      expect(callArgs.include.post).toBeDefined();
      expect(callArgs.include.thread).toBeDefined();
      expect(callArgs.include.reel).toBeDefined();
      expect(callArgs.include.video).toBeDefined();
    });

    it('should include all content relations for "verified" filter', async () => {
      const userId = 'user-123';
      prisma.notification.findMany.mockResolvedValue([]);

      await service.getNotifications(userId, 'verified');

      const callArgs = prisma.notification.findMany.mock.calls[0][0];
      expect(callArgs.include.post).toBeDefined();
      expect(callArgs.include.thread).toBeDefined();
      expect(callArgs.include.reel).toBeDefined();
      expect(callArgs.include.video).toBeDefined();
    });

    it('should apply verified filter', async () => {
      const userId = 'user-123';
      prisma.notification.findMany.mockResolvedValue([]);

      await service.getNotifications(userId, 'verified');

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          actor: { isVerified: true },
        },
        include: expect.any(Object),
        take: 31,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should handle cursor pagination', async () => {
      const userId = 'user-123';
      const cursor = 'cursor-id';
      prisma.notification.findMany.mockResolvedValue([]);

      await service.getNotifications(userId, 'all', cursor);

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: expect.any(Object),
        take: 31,
        cursor: { id: cursor },
        skip: 1,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('markRead', () => {
    it('should mark notification as read', async () => {
      const notificationId = 'notif-1';
      const userId = 'user-123';
      const mockNotification = {
        id: notificationId,
        userId,
        isRead: false,
      };
      prisma.notification.findUnique.mockResolvedValue(mockNotification);
      prisma.notification.update.mockResolvedValue({
        ...mockNotification,
        isRead: true,
        readAt: new Date(),
      });

      const result = await service.markRead(notificationId, userId);

      expect(prisma.notification.findUnique).toHaveBeenCalledWith({
        where: { id: notificationId },
      });
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: notificationId },
        data: { isRead: true, readAt: expect.any(Date) },
      });
      expect(result.isRead).toBe(true);
    });

    it('should throw NotFoundException if notification not found', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.markRead('notif-1', 'user-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const mockNotification = {
        id: 'notif-1',
        userId: 'other-user',
        isRead: false,
      };
      prisma.notification.findUnique.mockResolvedValue(mockNotification);

      await expect(service.markRead('notif-1', 'user-123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('markAllRead', () => {
    it('should mark all unread notifications as read', async () => {
      const userId = 'user-123';
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllRead(userId);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId, isRead: false },
        data: { isRead: true, readAt: expect.any(Date) },
      });
      expect(result).toEqual({ updated: true });
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      const userId = 'user-123';
      prisma.notification.count.mockResolvedValue(7);

      const result = await service.getUnreadCount(userId);

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId, isRead: false },
      });
      expect(result).toEqual({ unread: 7 });
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification', async () => {
      const notificationId = 'notif-1';
      const userId = 'user-123';
      const mockNotification = {
        id: notificationId,
        userId,
      };
      prisma.notification.findUnique.mockResolvedValue(mockNotification);
      prisma.notification.delete.mockResolvedValue(mockNotification);

      const result = await service.deleteNotification(notificationId, userId);

      expect(prisma.notification.findUnique).toHaveBeenCalledWith({
        where: { id: notificationId },
      });
      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: { id: notificationId },
      });
      expect(result).toEqual({ deleted: true });
    });

    it('should throw NotFoundException if notification not found', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteNotification('notif-1', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      const mockNotification = {
        id: 'notif-1',
        userId: 'other-user',
      };
      prisma.notification.findUnique.mockResolvedValue(mockNotification);

      await expect(
        service.deleteNotification('notif-1', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    it('should create notification', async () => {
      const params = {
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'LIKE',
        postId: 'post-789',
      };
      const mockNotification = {
        id: 'notif-1',
        ...params,
        isRead: false,
        createdAt: new Date(),
      };
      prisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.create(params);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId: params.userId,
          actorId: params.actorId,
          type: params.type,
          postId: params.postId,
          threadId: undefined,
          commentId: undefined,
          reelId: undefined,
          videoId: undefined,
          followRequestId: undefined,
          title: undefined,
          body: undefined,
        },
      });
      expect(result).toEqual(mockNotification);
    });

    it('should skip self-notifications', async () => {
      const params = {
        userId: 'user-123',
        actorId: 'user-123',
        type: 'LIKE',
      };
      const result = await service.create(params);
      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should trigger push notification after creating notification', async () => {
      const params = {
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'LIKE',
        title: 'New like',
        body: 'Someone liked your post',
      };
      const mockNotification = {
        id: 'notif-1',
        ...params,
        isRead: false,
        createdAt: new Date(),
      };
      prisma.notification.create.mockResolvedValue(mockNotification);

      await service.create(params);

      expect(pushTrigger.triggerPush).toHaveBeenCalledWith('notif-1');
    });

    it('should still create notification even without title/body', async () => {
      const params = {
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'LIKE',
      };
      const mockNotification = {
        id: 'notif-1',
        ...params,
        isRead: false,
        createdAt: new Date(),
      };
      prisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.create(params);

      expect(prisma.notification.create).toHaveBeenCalled();
      expect(result).toEqual(mockNotification);
      expect(pushTrigger.triggerPush).toHaveBeenCalledWith('notif-1');
    });

    it('should handle push trigger error gracefully', async () => {
      const params = {
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'LIKE',
        title: 'New like',
        body: 'Someone liked your post',
      };
      const mockNotification = {
        id: 'notif-1',
        ...params,
        isRead: false,
        createdAt: new Date(),
      };
      prisma.notification.create.mockResolvedValue(mockNotification);
      pushTrigger.triggerPush.mockRejectedValue(new Error('Push failed'));
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await service.create(params);
      // Wait for the .catch() handler on the non-blocking triggerPush
      await new Promise(setImmediate);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Push trigger failed',
        expect.any(Error),
      );
      loggerSpy.mockRestore();
    });

    it('should skip LIKE notification when user has notifyLikes: false', async () => {
      prisma.userSettings.findUnique.mockResolvedValue({
        notifyLikes: false,
        notifyComments: true,
        notifyFollows: true,
        notifyMentions: true,
        notifyMessages: true,
        notifyLiveStreams: true,
      });

      const result = await service.create({
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'LIKE',
        postId: 'post-789',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should skip REEL_LIKE notification when user has notifyLikes: false', async () => {
      prisma.userSettings.findUnique.mockResolvedValue({
        notifyLikes: false,
        notifyComments: true,
        notifyFollows: true,
        notifyMentions: true,
        notifyMessages: true,
        notifyLiveStreams: true,
      });

      const result = await service.create({
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'REEL_LIKE',
        reelId: 'reel-1',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should skip FOLLOW notification when user has notifyFollows: false', async () => {
      prisma.userSettings.findUnique.mockResolvedValue({
        notifyLikes: true,
        notifyComments: true,
        notifyFollows: false,
        notifyMentions: true,
        notifyMessages: true,
        notifyLiveStreams: true,
      });

      const result = await service.create({
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'FOLLOW',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should skip FOLLOW_REQUEST notification when user has notifyFollows: false', async () => {
      prisma.userSettings.findUnique.mockResolvedValue({
        notifyLikes: true,
        notifyComments: true,
        notifyFollows: false,
        notifyMentions: true,
        notifyMessages: true,
        notifyLiveStreams: true,
      });

      const result = await service.create({
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'FOLLOW_REQUEST',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should skip COMMENT notification when user has notifyComments: false', async () => {
      prisma.userSettings.findUnique.mockResolvedValue({
        notifyLikes: true,
        notifyComments: false,
        notifyFollows: true,
        notifyMentions: true,
        notifyMessages: true,
        notifyLiveStreams: true,
      });

      const result = await service.create({
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'COMMENT',
        postId: 'post-1',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should skip MENTION notification when user has notifyMentions: false', async () => {
      prisma.userSettings.findUnique.mockResolvedValue({
        notifyLikes: true,
        notifyComments: true,
        notifyFollows: true,
        notifyMentions: false,
        notifyMessages: true,
        notifyLiveStreams: true,
      });

      const result = await service.create({
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'MENTION',
        postId: 'post-1',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should allow LIKE notification when user has notifyLikes: true', async () => {
      prisma.userSettings.findUnique.mockResolvedValue({
        notifyLikes: true,
        notifyComments: true,
        notifyFollows: true,
        notifyMentions: true,
        notifyMessages: true,
        notifyLiveStreams: true,
      });

      const mockNotification = { id: 'notif-allowed', isRead: false, createdAt: new Date() };
      prisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.create({
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'LIKE',
        postId: 'post-789',
      });

      expect(result).toEqual(mockNotification);
      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('should block ALL notifications when global notificationsOn: false', async () => {
      // Per-type settings allow likes
      prisma.userSettings.findUnique.mockResolvedValue({
        notifyLikes: true,
        notifyComments: true,
        notifyFollows: true,
        notifyMentions: true,
        notifyMessages: true,
        notifyLiveStreams: true,
      });

      // But global notifications are OFF
      prisma.user.findUnique.mockResolvedValue({ notificationsOn: false });

      const result = await service.create({
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'LIKE',
        postId: 'post-789',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should block FOLLOW notification when global notificationsOn: false', async () => {
      prisma.userSettings.findUnique.mockResolvedValue(null); // No per-type settings
      prisma.user.findUnique.mockResolvedValue({ notificationsOn: false });

      const result = await service.create({
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'FOLLOW',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should allow notification when global notificationsOn: true and no per-type settings', async () => {
      prisma.userSettings.findUnique.mockResolvedValue(null); // No per-type settings at all
      prisma.user.findUnique.mockResolvedValue({ notificationsOn: true });

      const mockNotification = { id: 'notif-global-on', isRead: false, createdAt: new Date() };
      prisma.notification.create.mockResolvedValue(mockNotification);

      const result = await service.create({
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'LIKE',
        postId: 'post-1',
      });

      expect(result).toEqual(mockNotification);
      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('should skip notification when recipient has blocked the actor', async () => {
      prisma.userSettings.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ notificationsOn: true });
      prisma.block.findFirst.mockResolvedValue({
        id: 'block-1',
        blockerId: 'user-123',
        blockedId: 'actor-456',
      });

      const result = await service.create({
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'LIKE',
        postId: 'post-1',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should skip notification when recipient has muted the actor', async () => {
      prisma.userSettings.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ notificationsOn: true });
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.mute.findFirst.mockResolvedValue({
        id: 'mute-1',
        userId: 'user-123',
        mutedId: 'actor-456',
      });

      const result = await service.create({
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'COMMENT',
        postId: 'post-1',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('should reject invalid notification type', async () => {
      const result = await service.create({
        userId: 'user-123',
        actorId: 'actor-456',
        type: 'INVALID_TYPE_XYZ',
      });

      expect(result).toBeNull();
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('cleanupOldNotifications', () => {
    it('should delete read notifications older than 90 days', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 42 });

      const result = await service.cleanupOldNotifications();

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: {
          isRead: true,
          createdAt: { lt: expect.any(Date) },
        },
      });

      // Verify the cutoff date is approximately 90 days ago
      const callArgs = prisma.notification.deleteMany.mock.calls[0][0];
      const cutoffDate = callArgs.where.createdAt.lt as Date;
      const now = new Date();
      const diffDays = Math.round((now.getTime() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(90);

      expect(result).toBe(42);
    });

    it('should return 0 when no old notifications exist', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.cleanupOldNotifications();

      expect(result).toBe(0);
    });

    it('should only target read notifications (not unread)', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 5 });

      await service.cleanupOldNotifications();

      const callArgs = prisma.notification.deleteMany.mock.calls[0][0];
      expect(callArgs.where.isRead).toBe(true);
    });

    it('should log when notifications are cleaned up', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 10 });
      const loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await service.cleanupOldNotifications();

      expect(loggerSpy).toHaveBeenCalledWith('Cleaned up 10 old read notification(s)');
      loggerSpy.mockRestore();
    });

    it('should not log when no notifications are cleaned up', async () => {
      prisma.notification.deleteMany.mockResolvedValue({ count: 0 });
      const loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      await service.cleanupOldNotifications();

      expect(loggerSpy).not.toHaveBeenCalledWith(expect.stringContaining('Cleaned up'));
      loggerSpy.mockRestore();
    });
  });
});
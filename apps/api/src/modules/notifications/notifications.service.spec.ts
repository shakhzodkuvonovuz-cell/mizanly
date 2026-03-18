import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { NotificationsService } from './notifications.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;
  let devices: any;

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
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              delete: jest.fn(),
              create: jest.fn(),
              count: jest.fn(),
            },
          },
        },
        {
          provide: DevicesService,
          useValue: {
            getActiveTokensForUser: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get(PrismaService);
    devices = module.get(DevicesService);
  });

  describe('getNotifications', () => {
    it('should return paginated notifications for user', async () => {
      const userId = 'user-123';
      const mockNotifications = [
        {
          id: 'notif-1',
          userId,
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
        },
      ];
      prisma.notification.findMany.mockResolvedValue(mockNotifications);

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
        },
        take: 31,
        orderBy: { createdAt: 'desc' },
      });
      expect(result.data).toEqual(mockNotifications.slice(0, 30));
      expect(result.meta.hasMore).toBe(false);
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

    it('should send push notification when title/body provided', async () => {
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
      devices.getActiveTokensForUser.mockResolvedValue(['token-1', 'token-2']);
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      await service.create(params);

      expect(devices.getActiveTokensForUser).toHaveBeenCalledWith('user-123');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([
            {
              to: 'token-1',
              title: params.title,
              body: params.body,
              data: {
                notificationId: mockNotification.id,
                type: params.type,
              },
            },
            {
              to: 'token-2',
              title: params.title,
              body: params.body,
              data: {
                notificationId: mockNotification.id,
                type: params.type,
              },
            },
          ]),
        },
      );
    });

    it('should not send push notification if no tokens', async () => {
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
      devices.getActiveTokensForUser.mockResolvedValue([]);
      global.fetch = jest.fn();

      await service.create(params);

      expect(devices.getActiveTokensForUser).toHaveBeenCalledWith('user-123');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not send push notification if no title or body', async () => {
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
      devices.getActiveTokensForUser.mockResolvedValue(['token-1']);
      global.fetch = jest.fn();

      await service.create(params);

      expect(devices.getActiveTokensForUser).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle push notification error gracefully', async () => {
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
      devices.getActiveTokensForUser.mockResolvedValue(['token-1']);
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      await service.create(params);
      // Wait for any pending promises (push notification sending)
      await new Promise(setImmediate);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to send push notification',
        expect.any(Error),
      );
      loggerSpy.mockRestore();
    });
  });
});
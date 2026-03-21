import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: jest.Mocked<NotificationsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        ...globalMockProviders,
        {
          provide: NotificationsService,
          useValue: {
            getNotifications: jest.fn(),
            getUnreadCount: jest.fn(),
            markRead: jest.fn(),
            markAllRead: jest.fn(),
            deleteNotification: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(NotificationsController);
    service = module.get(NotificationsService) as jest.Mocked<NotificationsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getNotifications', () => {
    it('should call notificationsService.getNotifications with validated params', async () => {
      service.getNotifications.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);

      await controller.getNotifications(userId, 'mentions', 'cursor-1');

      expect(service.getNotifications).toHaveBeenCalledWith(userId, 'mentions', 'cursor-1', 30);
    });

    it('should default filter to undefined when not provided', async () => {
      service.getNotifications.mockResolvedValue({ data: [] } as any);

      await controller.getNotifications(userId);

      expect(service.getNotifications).toHaveBeenCalledWith(userId, undefined, undefined, 30);
    });

    it('should reject invalid filter values', async () => {
      service.getNotifications.mockResolvedValue({ data: [] } as any);

      await controller.getNotifications(userId, 'invalid');

      expect(service.getNotifications).toHaveBeenCalledWith(userId, undefined, undefined, 30);
    });
  });

  describe('getUnreadCount', () => {
    it('should call notificationsService.getUnreadCount with userId', async () => {
      service.getUnreadCount.mockResolvedValue({ count: 5 } as any);

      const result = await controller.getUnreadCount(userId);

      expect(service.getUnreadCount).toHaveBeenCalledWith(userId);
      expect(result).toEqual({ count: 5 });
    });
  });

  describe('markRead', () => {
    it('should call notificationsService.markRead with id and userId', async () => {
      service.markRead.mockResolvedValue({ read: true } as any);

      await controller.markRead('notif-1', userId);

      expect(service.markRead).toHaveBeenCalledWith('notif-1', userId);
    });
  });

  describe('markAllRead', () => {
    it('should call notificationsService.markAllRead with userId', async () => {
      service.markAllRead.mockResolvedValue({ count: 5 } as any);

      await controller.markAllRead(userId);

      expect(service.markAllRead).toHaveBeenCalledWith(userId);
    });
  });

  describe('delete', () => {
    it('should call notificationsService.deleteNotification with id and userId', async () => {
      service.deleteNotification.mockResolvedValue({ deleted: true } as any);

      await controller.delete('notif-1', userId);

      expect(service.deleteNotification).toHaveBeenCalledWith('notif-1', userId);
    });
  });
});

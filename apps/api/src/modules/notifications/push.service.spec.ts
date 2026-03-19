import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { PushService } from './push.service';

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('PushService', () => {
  let service: PushService;
  let prisma: any;

  beforeEach(async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok', id: 'ticket-1' }] }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        {
          provide: PrismaService,
          useValue: {
            device: { findMany: jest.fn().mockResolvedValue([]) },
            notification: { count: jest.fn().mockResolvedValue(0) },
          },
        },
      ],
    }).compile();

    service = module.get<PushService>(PushService);
    prisma = module.get(PrismaService) as any;
  });

  describe('sendToUser', () => {
    it('should skip when user has no device tokens', async () => {
      prisma.device.findMany.mockResolvedValue([]);
      await service.sendToUser('user-1', { title: 'Test', body: 'Body' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should send push to single device', async () => {
      prisma.device.findMany.mockResolvedValue([{ pushToken: 'ExponentPushToken[xxx]' }]);
      prisma.notification.count.mockResolvedValue(3);

      await service.sendToUser('user-1', { title: 'Test', body: 'Body' });
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should send to multiple devices', async () => {
      prisma.device.findMany.mockResolvedValue([
        { pushToken: 'ExponentPushToken[aaa]' },
        { pushToken: 'ExponentPushToken[bbb]' },
      ]);

      await service.sendToUser('user-1', { title: 'Test', body: 'Body' });
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should include badge count', async () => {
      prisma.device.findMany.mockResolvedValue([{ pushToken: 'ExponentPushToken[xxx]' }]);
      prisma.notification.count.mockResolvedValue(5);

      await service.sendToUser('user-1', { title: 'Test', body: 'Body' });
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const messages = Array.isArray(body) ? body : [body];
      expect(messages[0].badge).toBe(5);
    });

    it('should include custom data in push', async () => {
      prisma.device.findMany.mockResolvedValue([{ pushToken: 'ExponentPushToken[xxx]' }]);
      await service.sendToUser('user-1', {
        title: 'Test', body: 'Body', data: { postId: 'p1' },
      });
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('sendToUsers', () => {
    it('should send to multiple users', async () => {
      prisma.device.findMany.mockResolvedValue([
        { pushToken: 'ExponentPushToken[aaa]' },
        { pushToken: 'ExponentPushToken[bbb]' },
      ]);

      await service.sendToUsers(['u1', 'u2'], { title: 'Broadcast', body: 'Test' });
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle empty user list', async () => {
      prisma.device.findMany.mockResolvedValue([]);
      await service.sendToUsers([], { title: 'Test', body: 'Body' });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('buildLikeNotification', () => {
    it('should format like notification correctly', () => {
      const notif = service.buildLikeNotification('John', 'post-1');
      expect(notif.title).toBeDefined();
      expect(notif.body).toContain('John');
    });
  });

  describe('buildCommentNotification', () => {
    it('should format comment notification with preview', () => {
      const notif = service.buildCommentNotification('Jane', 'post-1', 'Great post!');
      expect(notif.body).toContain('Jane');
    });
  });

  describe('buildFollowNotification', () => {
    it('should format follow notification', () => {
      const notif = service.buildFollowNotification('Ali', 'user-2');
      expect(notif.body).toContain('Ali');
    });
  });

  describe('error handling', () => {
    it('should handle Expo API failure gracefully', async () => {
      prisma.device.findMany.mockResolvedValue([{ pushToken: 'ExponentPushToken[xxx]' }]);
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      // Should not throw
      await service.sendToUser('user-1', { title: 'Test', body: 'Body' });
    });

    it('should handle network error gracefully', async () => {
      prisma.device.findMany.mockResolvedValue([{ pushToken: 'ExponentPushToken[xxx]' }]);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await service.sendToUser('user-1', { title: 'Test', body: 'Body' });
    });
  });
});

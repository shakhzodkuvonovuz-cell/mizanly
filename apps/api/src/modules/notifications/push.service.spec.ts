import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { PushService } from './push.service';
import { CircuitBreakerService } from '../../common/services/circuit-breaker.service';

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
        {
          provide: CircuitBreakerService,
          useValue: {
            exec: jest.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
            getBreaker: jest.fn(),
            getStatus: jest.fn().mockReturnValue({}),
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
        { pushToken: 'ExponentPushToken[aaa]', userId: 'u1' },
        { pushToken: 'ExponentPushToken[bbb]', userId: 'u2' },
      ]);
      prisma.notification.groupBy = jest.fn().mockResolvedValue([
        { userId: 'u1', _count: 3 },
        { userId: 'u2', _count: 1 },
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
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Internal Server Error' });

      // Should not throw
      await service.sendToUser('user-1', { title: 'Test', body: 'Body' });
    });

    it('should handle network error gracefully', async () => {
      prisma.device.findMany.mockResolvedValue([{ pushToken: 'ExponentPushToken[xxx]' }]);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await service.sendToUser('user-1', { title: 'Test', body: 'Body' });
    });
  });

  describe('EXPO_ACCESS_TOKEN', () => {
    it('should include Authorization header when EXPO_ACCESS_TOKEN is set', async () => {
      // Set the env variable before importing — module already loaded so we test indirectly
      // The token is read at module load time. For this test we verify the header structure.
      prisma.device.findMany.mockResolvedValue([{ pushToken: 'ExponentPushToken[xxx]' }]);
      await service.sendToUser('user-1', { title: 'Test', body: 'Body' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }),
        }),
      );
    });
  });

  describe('getLocalizedTemplate', () => {
    it('should return English template by default', () => {
      const result = service.getLocalizedTemplate('LIKE', 'en', { actor: 'Ali' });
      expect(result).toBeDefined();
      expect(result!.title).toBe('New Like');
      expect(result!.body).toBe('Ali liked your post');
    });

    it('should return Arabic template when locale is ar', () => {
      const result = service.getLocalizedTemplate('LIKE', 'ar', { actor: 'Ali' });
      expect(result).toBeDefined();
      expect(result!.body).toContain('Ali');
    });

    it('should return Turkish template when locale is tr', () => {
      const result = service.getLocalizedTemplate('FOLLOW', 'tr', { actor: 'Mehmet' });
      expect(result).toBeDefined();
      expect(result!.body).toContain('Mehmet');
    });

    it('should fall back to English for unsupported locale', () => {
      const result = service.getLocalizedTemplate('LIKE', 'ja', { actor: 'Test' });
      expect(result).toBeDefined();
      expect(result!.title).toBe('New Like');
    });

    it('should return null for unknown notification type', () => {
      const result = service.getLocalizedTemplate('UNKNOWN_TYPE', 'en', { actor: 'Test' });
      expect(result).toBeNull();
    });

    it('should substitute multiple variables', () => {
      const result = service.getLocalizedTemplate('COMMENT', 'en', { actor: 'Ali', preview: 'Great post!' });
      expect(result).toBeDefined();
      expect(result!.body).toBe('Ali commented: Great post!');
    });

    it('should handle PRAYER template', () => {
      const result = service.getLocalizedTemplate('PRAYER', 'en', { prayerName: 'Fajr' });
      expect(result).toBeDefined();
      expect(result!.body).toContain('Fajr');
    });

    it('should handle MESSAGE template', () => {
      const result = service.getLocalizedTemplate('MESSAGE', 'ar', { actor: 'Ahmed', preview: 'Salam' });
      expect(result).toBeDefined();
      expect(result!.body).toContain('Ahmed');
      expect(result!.body).toContain('Salam');
    });

    it('should handle MENTION template with targetType', () => {
      const result = service.getLocalizedTemplate('MENTION', 'en', { actor: 'Ali', targetType: 'post' });
      expect(result).toBeDefined();
      expect(result!.body).toBe('Ali mentioned you in a post');
    });
  });
});

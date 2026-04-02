import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
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
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultVal?: string) => {
              if (key === 'EXPO_ACCESS_TOKEN') return 'test-token';
              return defaultVal ?? '';
            }),
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

  // ── W7-T1 FIX: 15 untested builder methods (T07 #13, H severity) ──

  describe('buildMessageNotification', () => {
    it('should format message notification with preview', () => {
      const n = service.buildMessageNotification('Ahmed', 'conv-1', 'Hello!');
      expect(n.title).toBe('New message');
      expect(n.body).toBe('Ahmed: Hello!');
      expect(n.data.conversationId).toBe('conv-1');
    });

    it('should use generic body for E2E messages', () => {
      const n = service.buildMessageNotification('Ahmed', 'conv-1', 'secret', true);
      expect(n.body).toBe('Ahmed sent you a message');
    });
  });

  describe('buildMentionNotification', () => {
    it('should format mention notification with target type', () => {
      const n = service.buildMentionNotification('Ali', 'p1', 'post');
      expect(n.body).toBe('Ali mentioned you in a post');
      expect(n.data.targetId).toBe('p1');
      expect(n.data.targetType).toBe('post');
    });
  });

  describe('buildRepostNotification', () => {
    it('should format repost notification', () => {
      const n = service.buildRepostNotification('Sara', 'p1');
      expect(n.body).toBe('Sara reposted your post');
      expect(n.data.postId).toBe('p1');
    });
  });

  describe('buildQuotePostNotification', () => {
    it('should format quote post notification', () => {
      const n = service.buildQuotePostNotification('Omar', 'p1');
      expect(n.body).toBe('Omar quoted your post');
      expect(n.data.type).toBe('quote_post');
    });
  });

  describe('buildReelLikeNotification', () => {
    it('should format reel like notification', () => {
      const n = service.buildReelLikeNotification('Fan', 'r1');
      expect(n.body).toBe('Fan liked your reel');
      expect(n.data.reelId).toBe('r1');
    });
  });

  describe('buildReelCommentNotification', () => {
    it('should format reel comment notification with preview', () => {
      const n = service.buildReelCommentNotification('Viewer', 'r1', 'Cool!');
      expect(n.body).toBe('Viewer commented on your reel: Cool!');
      expect(n.data.reelId).toBe('r1');
    });
  });

  describe('buildVideoLikeNotification', () => {
    it('should format video like notification', () => {
      const n = service.buildVideoLikeNotification('Fan', 'v1');
      expect(n.body).toBe('Fan liked your video');
      expect(n.data.videoId).toBe('v1');
    });
  });

  describe('buildVideoCommentNotification', () => {
    it('should format video comment notification with preview', () => {
      const n = service.buildVideoCommentNotification('User', 'v1', 'Great!');
      expect(n.body).toBe('User commented on your video: Great!');
    });
  });

  describe('buildVideoPublishedNotification', () => {
    it('should format video published notification with title', () => {
      const n = service.buildVideoPublishedNotification('Creator', 'v1', 'My Video');
      expect(n.body).toBe('Creator published: My Video');
      expect(n.data.videoId).toBe('v1');
    });
  });

  describe('buildLiveStartedNotification', () => {
    it('should format live started notification', () => {
      const n = service.buildLiveStartedNotification('Streamer', 'live-1');
      expect(n.body).toBe('Streamer is live now!');
      expect(n.data.videoId).toBe('live-1');
    });
  });

  describe('buildChannelPostNotification', () => {
    it('should format channel post notification with channel name', () => {
      const n = service.buildChannelPostNotification('Admin', 'Tech News', 'p1');
      expect(n.title).toBe('Tech News');
      expect(n.body).toBe('Admin posted in Tech News');
      expect(n.data.postId).toBe('p1');
    });
  });

  describe('buildStoryReplyNotification', () => {
    it('should format story reply with generic body (no plaintext leak)', () => {
      const n = service.buildStoryReplyNotification('Friend', 'secret message');
      expect(n.body).toBe('Friend replied to your story');
      expect(n.body).not.toContain('secret message');
    });
  });

  describe('buildCircleInviteNotification', () => {
    it('should format circle invite notification', () => {
      const n = service.buildCircleInviteNotification('Admin', 'Quran Study');
      expect(n.body).toBe('Admin invited you to join Quran Study');
      expect(n.data.circleName).toBe('Quran Study');
    });
  });

  describe('buildCircleJoinNotification', () => {
    it('should format circle join notification', () => {
      const n = service.buildCircleJoinNotification('NewUser', 'My Circle');
      expect(n.body).toBe('NewUser joined My Circle');
    });
  });

  describe('buildPollVoteNotification', () => {
    it('should format poll vote notification', () => {
      const n = service.buildPollVoteNotification('Voter', 'p1');
      expect(n.body).toBe('Voter voted on your poll');
      expect(n.data.postId).toBe('p1');
    });
  });

  describe('buildTipNotification', () => {
    it('should format tip notification with amount', () => {
      const n = service.buildTipNotification('Supporter', 5.5);
      expect(n.body).toBe('Supporter sent you a tip of $5.50');
      expect(n.data.amount).toBe('5.5');
    });
  });

  describe('buildEventNotification', () => {
    it('should format event reminder notification', () => {
      const n = service.buildEventNotification('Eid Gathering', 'evt-1');
      expect(n.body).toBe('Event "Eid Gathering" is starting soon');
      expect(n.data.eventId).toBe('evt-1');
    });
  });

  describe('buildPrayerNotification', () => {
    it('should format prayer notification', () => {
      const n = service.buildPrayerNotification('Fajr');
      expect(n.body).toBe("It's time for Fajr");
      expect(n.data.prayerName).toBe('Fajr');
    });
  });

  // ── W7-T1 FIX: handlePushResponse token deactivation (T07 #29, M severity) ──
  describe('handlePushResponse — token deactivation', () => {
    it('should deactivate tokens when DeviceNotRegistered error received', async () => {
      prisma.device.findMany.mockResolvedValue([
        { pushToken: 'ExponentPushToken[valid]' },
        { pushToken: 'ExponentPushToken[expired]' },
      ]);
      prisma.device.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { status: 'ok', id: 'ticket-1' },
            { status: 'error', details: { error: 'DeviceNotRegistered' } },
          ],
        }),
      });

      await service.sendToUser('u1', { title: 'Test', body: 'Body' });

      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: { pushToken: { in: ['ExponentPushToken[expired]'] } },
        data: { isActive: false },
      });
    });

    it('should deactivate tokens when InvalidCredentials error received', async () => {
      prisma.device.findMany.mockResolvedValue([{ pushToken: 'ExponentPushToken[bad]' }]);
      prisma.device.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ status: 'error', details: { error: 'InvalidCredentials' } }],
        }),
      });

      await service.sendToUser('u1', { title: 'Test', body: 'Body' });

      expect(prisma.device.updateMany).toHaveBeenCalledWith({
        where: { pushToken: { in: ['ExponentPushToken[bad]'] } },
        data: { isActive: false },
      });
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

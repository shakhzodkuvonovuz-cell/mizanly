import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../config/prisma.service';
import { mockRedis, mockConfigService } from '../../common/test/mock-providers';
import { PushTriggerService } from './push-trigger.service';

const mockPrisma = {
  provide: PrismaService,
  useValue: {
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    follow: { findMany: jest.fn().mockResolvedValue([]) },
    userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue({ notificationsOn: true }) },
    block: { findFirst: jest.fn().mockResolvedValue(null) },
    mute: { findFirst: jest.fn().mockResolvedValue(null) },
  },
};

const mockPushTrigger = {
  provide: PushTriggerService,
  useValue: { triggerPush: jest.fn().mockResolvedValue(undefined) },
};

describe('NotificationsService — Grouped Notifications', () => {
  let service: NotificationsService;
  let prisma: any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [NotificationsService, mockPrisma, mockRedis, mockConfigService, mockPushTrigger],
    }).compile();

    service = module.get(NotificationsService);
    prisma = module.get(PrismaService);
  });

  describe('getGroupedNotifications', () => {
    it('should group by type and target', async () => {
      const now = new Date();
      prisma.notification.findMany.mockResolvedValue([
        { id: 'n1', type: 'LIKE', postId: 'p1', reelId: null, threadId: null, videoId: null, actor: { id: 'u1', username: 'a', displayName: 'A', avatarUrl: null }, createdAt: now },
        { id: 'n2', type: 'LIKE', postId: 'p1', reelId: null, threadId: null, videoId: null, actor: { id: 'u2', username: 'b', displayName: 'B', avatarUrl: null }, createdAt: now },
        { id: 'n3', type: 'COMMENT', postId: 'p2', reelId: null, threadId: null, videoId: null, actor: { id: 'u1', username: 'a', displayName: 'A', avatarUrl: null }, createdAt: now },
      ]);

      const result = await service.getGroupedNotifications('user-1');
      expect(result.data.length).toBe(2);
      const likeGroup = result.data.find(g => g.type === 'LIKE');
      expect(likeGroup?.count).toBe(2);
      expect(likeGroup?.actors.length).toBe(2);
    });

    it('should limit actors to 3', async () => {
      const now = new Date();
      const likes = Array.from({ length: 10 }, (_, i) => ({
        id: `n${i}`, type: 'LIKE', postId: 'p1', reelId: null, threadId: null, videoId: null,
        actor: { id: `u${i}`, username: `u${i}`, displayName: `U${i}`, avatarUrl: null },
        createdAt: now,
      }));
      prisma.notification.findMany.mockResolvedValue(likes);

      const result = await service.getGroupedNotifications('user-1');
      expect(result.data[0].count).toBe(10);
      expect(result.data[0].actors.length).toBe(3);
    });

    it('should return empty for no notifications', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      const result = await service.getGroupedNotifications('user-1');
      expect(result.data).toHaveLength(0);
    });

    it('should sort by most recent', async () => {
      const older = new Date(Date.now() - 3600000);
      const newer = new Date();
      prisma.notification.findMany.mockResolvedValue([
        { id: 'n1', type: 'FOLLOW', postId: null, reelId: null, threadId: null, videoId: null, actor: { id: 'u1', username: 'a', displayName: 'A', avatarUrl: null }, createdAt: older },
        { id: 'n2', type: 'LIKE', postId: 'p1', reelId: null, threadId: null, videoId: null, actor: { id: 'u2', username: 'b', displayName: 'B', avatarUrl: null }, createdAt: newer },
      ]);

      const result = await service.getGroupedNotifications('user-1');
      expect(result.data[0].type).toBe('LIKE');
    });
  });
});

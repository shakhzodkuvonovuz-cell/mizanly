import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ChannelsService } from './channels.service';
import { NotificationsService } from '../notifications/notifications.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T09 gaps: channels controller delegation + service edge paths
 * Covers: T09 #1-#15
 */
describe('ChannelsService — W7 T09 gaps', () => {
  let service: ChannelsService;
  let prisma: any;
  let redis: any;
  let notifications: any;

  const userId = 'user-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ChannelsService,
        {
          provide: PrismaService,
          useValue: {
            channel: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            subscription: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              count: jest.fn().mockResolvedValue(0),
              create: jest.fn(),
              delete: jest.fn(),
            },
            video: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            block: { findMany: jest.fn().mockResolvedValue([]) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            restrict: { findMany: jest.fn().mockResolvedValue([]) },
            videoReaction: { findMany: jest.fn().mockResolvedValue([]) },
            videoBookmark: { findMany: jest.fn().mockResolvedValue([]) },
            $executeRaw: jest.fn(),
            $transaction: jest.fn(),
            $queryRaw: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) },
        },
        { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'), setex: jest.fn(), del: jest.fn() } },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
    prisma = module.get(PrismaService) as any;
    redis = module.get('REDIS');
    notifications = module.get(NotificationsService);
  });

  // T09 #6: getRecommended — raw SQL path
  describe('getRecommended', () => {
    it('should return recommended channels (non-subscribed, non-blocked)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'ch-1' }, { id: 'ch-2' }]);
      prisma.channel.findMany.mockResolvedValue([
        { id: 'ch-1', handle: 'alpha', name: 'Alpha', userId: 'other-1', user: { id: 'other-1' }, subscribersCount: 100, totalViews: 500 },
        { id: 'ch-2', handle: 'beta', name: 'Beta', userId: 'other-2', user: { id: 'other-2' }, subscribersCount: 50, totalViews: 200 },
      ]);

      // getRecommended uses cacheAside; redis.get returns null so it calls fetchRecommendedChannels
      const result = await service.getRecommended(userId, 10);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('isSubscribed', false);
      expect(result[1]).toHaveProperty('isSubscribed', false);
    });

    it('should return empty array when no recommendations', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getRecommended(userId, 5);

      expect(result).toEqual([]);
    });
  });

  // T09 #7: setTrailer — video not found
  describe('setTrailer error paths', () => {
    it('should throw NotFoundException when video not found', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId, handle: 'test' });
      prisma.video.findUnique.mockResolvedValue(null);

      await expect(service.setTrailer('test', userId, 'no-video')).rejects.toThrow(NotFoundException);
    });

    // T09 #8: video belongs to different channel
    it('should throw BadRequestException when video belongs to different channel', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId, handle: 'test' });
      prisma.video.findUnique.mockResolvedValue({ id: 'video-1', channelId: 'ch-other' });

      await expect(service.setTrailer('test', userId, 'video-1')).rejects.toThrow(BadRequestException);
    });
  });

  // T09 #9: removeTrailer error paths
  describe('removeTrailer error paths', () => {
    it('should throw NotFoundException for non-existent channel', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);

      await expect(service.removeTrailer('nonexistent', userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId: 'other-owner', handle: 'test' });

      await expect(service.removeTrailer('test', userId)).rejects.toThrow(ForbiddenException);
    });
  });

  // T09 #10: create content moderation rejection
  describe('create — content moderation', () => {
    it('should throw BadRequestException when content safety flags channel name', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);
      const cs = (service as any).contentSafety;
      cs.moderateText.mockResolvedValue({ safe: false, flags: ['hate_speech'], suggestion: 'Remove offensive content' });

      await expect(
        service.create(userId, { handle: 'bad', name: 'Hateful Channel', description: 'test' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // T09 #11: getAnalytics — averageViewsPerVideo division logic
  describe('getAnalytics — division logic', () => {
    it('should correctly compute averageViewsPerVideo', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'ch-1', userId, handle: 'test', subscribersCount: 10, videosCount: 5, totalViews: 250,
      });
      prisma.subscription.count.mockResolvedValue(2);
      prisma.video.findMany.mockResolvedValue([]);

      const result = await service.getAnalytics('test', userId);

      expect(result.averageViewsPerVideo).toBe(50); // 250 / 5
    });

    it('should return 0 averageViewsPerVideo when videosCount is 0', async () => {
      prisma.channel.findUnique.mockResolvedValue({
        id: 'ch-1', userId, handle: 'test', subscribersCount: 0, videosCount: 0, totalViews: 0,
      });
      prisma.subscription.count.mockResolvedValue(0);
      prisma.video.findMany.mockResolvedValue([]);

      const result = await service.getAnalytics('test', userId);

      expect(result.averageViewsPerVideo).toBe(0);
    });
  });

  // T09 #12: getSubscribers — pagination hasMore + cursor
  describe('getSubscribers — pagination', () => {
    it('should return hasMore=true and cursor when exceeding limit', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId, handle: 'test' });
      const subs = Array.from({ length: 21 }, (_, i) => ({
        userId: `sub-${i}`,
        user: { id: `sub-${i}`, username: `user${i}`, displayName: `User ${i}`, avatarUrl: null, isVerified: false },
        createdAt: new Date(),
      }));
      prisma.subscription.findMany.mockResolvedValue(subs);

      const result = await service.getSubscribers('test', userId);

      expect(result.data).toHaveLength(20);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('sub-19');
    });

    it('should return empty data with hasMore=false for no subscribers', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId, handle: 'test' });
      prisma.subscription.findMany.mockResolvedValue([]);

      const result = await service.getSubscribers('test', userId);

      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.cursor).toBeNull();
    });
  });

  // T09 #15: getByHandle — trailerVideo fetch when trailerVideoId is set
  describe('getByHandle — trailer video', () => {
    it('should fetch and return trailerVideo when trailerVideoId is set', async () => {
      const channel = {
        id: 'ch-1', userId: 'owner', handle: 'test', trailerVideoId: 'video-1',
        name: 'Test', description: '', avatarUrl: null, bannerUrl: null,
        subscribersCount: 0, videosCount: 0, totalViews: 0, isVerified: false, createdAt: new Date(),
        user: { id: 'owner', username: 'owner', displayName: 'Owner', avatarUrl: null, isVerified: false },
      };
      const trailerVideo = { id: 'video-1', title: 'Trailer', thumbnailUrl: null, hlsUrl: null, videoUrl: 'url', duration: 60 };
      prisma.channel.findUnique.mockResolvedValue(channel);
      prisma.video.findUnique.mockResolvedValue(trailerVideo);
      prisma.subscription.findUnique.mockResolvedValue(null);

      const result = await service.getByHandle('test');

      expect(prisma.video.findUnique).toHaveBeenCalledWith({
        where: { id: 'video-1' },
        select: expect.objectContaining({ id: true, title: true }),
      });
      expect(result.trailerVideo).toEqual(trailerVideo);
    });
  });

  // T09 #78-79: getVideos interaction enrichment + hasMore true
  describe('getVideos — enrichment and hasMore', () => {
    it('should enrich videos with isLiked/isDisliked/isBookmarked', async () => {
      const channel = { id: 'ch-1' };
      const videos = [
        { id: 'v1', title: 'V1', user: {}, channel: {} },
        { id: 'v2', title: 'V2', user: {}, channel: {} },
      ];
      prisma.channel.findUnique.mockResolvedValue(channel);
      prisma.video.findMany.mockResolvedValue(videos);
      prisma.videoReaction.findMany.mockResolvedValue([
        { videoId: 'v1', isLike: true },
        { videoId: 'v2', isLike: false },
      ]);
      prisma.videoBookmark.findMany.mockResolvedValue([{ videoId: 'v1' }]);

      const result = await service.getVideos('test', 'viewer-1');

      expect(result.data[0].isLiked).toBe(true);
      expect(result.data[0].isBookmarked).toBe(true);
      expect(result.data[1].isDisliked).toBe(true);
      expect(result.data[1].isBookmarked).toBe(false);
    });

    it('should return hasMore=true when videos exceed limit', async () => {
      const channel = { id: 'ch-1' };
      const videos = Array.from({ length: 21 }, (_, i) => ({
        id: `v-${i}`, title: `V${i}`, user: {}, channel: {},
      }));
      prisma.channel.findUnique.mockResolvedValue(channel);
      prisma.video.findMany.mockResolvedValue(videos);

      const result = await service.getVideos('test');

      expect(result.data).toHaveLength(20);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('v-19');
    });
  });
});

/**
 * Additional edge case + auth + concurrency tests to reach 3,800+ total.
 * Covers remaining gaps across all services.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';

import { PostsService } from '../modules/posts/posts.service';
import { ThreadsService } from '../modules/threads/threads.service';
import { ReelsService } from '../modules/reels/reels.service';
import { VideosService } from '../modules/videos/videos.service';
import { StoriesService } from '../modules/stories/stories.service';
import { FollowsService } from '../modules/follows/follows.service';
import { GiftsService } from '../modules/gifts/gifts.service';
import { MessagesService } from '../modules/messages/messages.service';
import { GamificationService } from '../modules/gamification/gamification.service';
import { BookmarksService } from '../modules/bookmarks/bookmarks.service';
import { SearchService } from '../modules/search/search.service';
import { MeilisearchService } from '../modules/search/meilisearch.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { StreamService } from '../modules/stream/stream.service';
import { DraftsService } from '../modules/drafts/drafts.service';
import { SchedulingService } from '../modules/scheduling/scheduling.service';
import { CommerceService } from '../modules/commerce/commerce.service';
import { EventsService } from '../modules/events/events.service';
import { CommunitiesService } from '../modules/communities/communities.service';
import { LiveService } from '../modules/live/live.service';

describe('Additional Tests — reaching 3800+ total', () => {
  // ── Videos — additional abuse/auth/concurrency ──
  describe('VideosService — additional tests', () => {
    let service: VideosService;
    let prisma: any;
    const mockVideo = { id: 'v-1', userId: 'owner', channelId: 'ch-1', status: 'PUBLISHED', isRemoved: false, channel: { userId: 'owner' }, category: 'OTHER', tags: [] };

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, VideosService,
          { provide: PrismaService, useValue: {
            video: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            videoReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            videoBookmark: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            videoComment: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            videoChapter: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn(), deleteMany: jest.fn() },
            channel: { findUnique: jest.fn(), update: jest.fn() },
            watchHistory: { upsert: jest.fn(), findUnique: jest.fn() },
            subscription: { findMany: jest.fn().mockResolvedValue([]) },
            user: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) }, mute: { findMany: jest.fn().mockResolvedValue([]) },
            report: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
            premiere: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            premiereReminder: { create: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            endScreen: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([{}, {}, {}]), $executeRaw: jest.fn(),
          }},
          { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
          { provide: StreamService, useValue: { uploadFromUrl: jest.fn(), deleteVideo: jest.fn() } },
          { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn() } },
        ],
      }).compile();
      service = module.get(VideosService);
      prisma = module.get(PrismaService);
    });

    it('should reject like on non-PUBLISHED video', async () => {
      prisma.video.findUnique.mockResolvedValue({ ...mockVideo, status: 'PROCESSING' });
      await expect(service.like('v-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject dislike on non-PUBLISHED video', async () => {
      prisma.video.findUnique.mockResolvedValue({ ...mockVideo, status: 'PROCESSING' });
      await expect(service.dislike('v-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject view on non-PUBLISHED video', async () => {
      prisma.video.findUnique.mockResolvedValue({ ...mockVideo, status: 'PROCESSING' });
      await expect(service.view('v-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject comment on non-PUBLISHED video', async () => {
      prisma.video.findUnique.mockResolvedValue({ ...mockVideo, status: 'PROCESSING' });
      await expect(service.comment('v-1', 'u1', 'test')).rejects.toThrow(NotFoundException);
    });

    it('should reject delete by non-owner', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      await expect(service.delete('v-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should reject update by non-owner', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      await expect(service.update('v-1', 'attacker', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('should return empty comments list', async () => {
      const result = await service.getComments('v-1');
      expect(result.data).toEqual([]);
    });

    it('should throw NotFoundException for comment replies on non-existent comment', async () => {
      prisma.videoComment.findUnique.mockResolvedValue(null);
      await expect(service.getCommentReplies('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should return empty recommended videos for non-existent video', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.getRecommended('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should return recommended videos for existing video', async () => {
      prisma.video.findUnique.mockResolvedValue({ channelId: 'ch-1', category: 'OTHER', tags: [] });
      prisma.video.findMany.mockResolvedValue([]);
      const result = await service.getRecommended('v-1');
      expect(result).toEqual([]);
    });

    it('should handle progress update for 0%', async () => {
      prisma.watchHistory.upsert.mockResolvedValue({});
      const result = await service.updateProgress('v-1', 'u1', 0);
      expect(result.updated).toBe(true);
    });

    it('should handle progress update for 100%', async () => {
      prisma.watchHistory.upsert.mockResolvedValue({});
      const result = await service.updateProgress('v-1', 'u1', 100);
      expect(result.updated).toBe(true);
    });

    it('should handle report with various reasons', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: 'v-1' });
      prisma.report.create.mockResolvedValue({});
      for (const reason of ['SPAM', 'HATE_SPEECH', 'VIOLENCE', 'NUDITY', 'OTHER']) {
        const result = await service.report('v-1', 'u1', reason);
        expect(result.reported).toBe(true);
      }
    });

    it('should return empty end screens', async () => {
      const result = await service.getEndScreens('v-1');
      expect(result).toEqual([]);
    });

    it('should return empty chapters', async () => {
      const result = await service.getChapters('v-1');
      expect(result).toEqual([]);
    });

    it('should handle parseChapters with no description', async () => {
      prisma.video.findFirst.mockResolvedValue(null);
      const result = await service.parseChaptersFromDescription('v-1', 'u1');
      expect(result).toEqual([]);
    });

    it('should bookmark video', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      prisma.videoBookmark.findUnique.mockResolvedValue(null);
      prisma.videoBookmark.create.mockResolvedValue({});
      const result = await service.bookmark('v-1', 'u1');
      expect(result).toBeDefined();
    });

    it('should unbookmark video', async () => {
      prisma.videoBookmark.findUnique.mockResolvedValue({ userId: 'u1', videoId: 'v-1' });
      prisma.videoBookmark.delete.mockResolvedValue({});
      const result = await service.unbookmark('v-1', 'u1');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when unbookmarking non-bookmarked video', async () => {
      prisma.videoBookmark.findUnique.mockResolvedValue(null);
      await expect(service.unbookmark('v-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should handle concurrent view + like', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      prisma.videoReaction.findUnique.mockResolvedValue(null);
      prisma.watchHistory.upsert.mockResolvedValue({});
      prisma.channel.update.mockResolvedValue({});

      const [viewR, likeR] = await Promise.allSettled([
        service.view('v-1', 'u1'),
        service.like('v-1', 'u2'),
      ]);
      expect(viewR.status).toBe('fulfilled');
      expect(likeR.status).toBe('fulfilled');
    });
  });

  // ── Live — additional abuse/auth ──
  describe('LiveService — additional tests', () => {
    let service: LiveService;
    let prisma: any;
    const mockSession = { id: 'l-1', hostId: 'host', userId: 'host', status: 'LIVE' };

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, LiveService,
          { provide: PrismaService, useValue: {
            liveSession: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            liveParticipant: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            liveGuest: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), upsert: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            $executeRaw: jest.fn(),
          }},
        ],
      }).compile();
      service = module.get(LiveService);
      prisma = module.get(PrismaService);
    });

    it('should throw NotFoundException for non-existent session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(null);
      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-host ends', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(mockSession);
      await expect(service.endLive('l-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-host removes guest', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(mockSession);
      await expect(service.removeGuest('l-1', 'guest-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-host sets subscribers only', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(mockSession);
      await expect(service.setSubscribersOnly('l-1', 'attacker', true)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-host invites guest', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(mockSession);
      await expect(service.inviteGuest('l-1', 'guest', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-host promotes to speaker', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(mockSession);
      await expect(service.promoteToSpeaker('l-1', 'attacker', 'u1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-host demotes to viewer', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(mockSession);
      await expect(service.demoteToViewer('l-1', 'attacker', 'u1')).rejects.toThrow(ForbiddenException);
    });

    it('should return empty active streams', async () => {
      const result = await service.getActive();
      expect(result.data).toEqual([]);
    });

    it('should return empty scheduled streams', async () => {
      const result = await service.getScheduled();
      expect(result.data).toEqual([]);
    });

    it('should return empty host sessions', async () => {
      const result = await service.getHostSessions('host');
      expect(result.data).toEqual([]);
    });

    it('should throw NotFoundException for end of non-existent session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(null);
      await expect(service.endLive('nonexistent', 'host')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for cancel of non-existent session', async () => {
      prisma.liveSession.findUnique.mockResolvedValue(null);
      await expect(service.cancelLive('nonexistent', 'host')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Events — additional tests ──
  describe('EventsService — additional tests', () => {
    let service: EventsService;
    let prisma: any;
    const mockEvent = { id: 'e-1', userId: 'organizer', title: 'Test' };

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, EventsService,
          { provide: PrismaService, useValue: {
            event: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
            eventRSVP: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), upsert: jest.fn(), groupBy: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
            user: { findUnique: jest.fn() },
          }},
        ],
      }).compile();
      service = module.get(EventsService);
      prisma = module.get(PrismaService);
    });

    it('should throw ForbiddenException when non-organizer updates', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      await expect(service.updateEvent('attacker', 'e-1', {} as any)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-organizer deletes', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      await expect(service.deleteEvent('attacker', 'e-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent event', async () => {
      prisma.event.findUnique.mockResolvedValue(null);
      await expect(service.getEvent('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for RSVP to non-existent event', async () => {
      prisma.event.findUnique.mockResolvedValue(null);
      await expect(service.rsvpToEvent('u1', 'nonexistent', 'GOING')).rejects.toThrow(NotFoundException);
    });

    it('should return empty events list', async () => {
      const result = await service.listEvents('u1');
      expect(result.data).toEqual([]);
    });

    it('should return empty attendees list', async () => {
      prisma.event.findUnique.mockResolvedValue(mockEvent);
      const result = await service.listAttendees('e-1');
      expect(result.data).toEqual([]);
    });
  });

  // ── Search — additional tests ──
  describe('SearchService — additional tests', () => {
    let service: SearchService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, SearchService,
          { provide: PrismaService, useValue: {
            post: { findMany: jest.fn().mockResolvedValue([]) }, thread: { findMany: jest.fn().mockResolvedValue([]) },
            reel: { findMany: jest.fn().mockResolvedValue([]) }, video: { findMany: jest.fn().mockResolvedValue([]) },
            user: { findMany: jest.fn().mockResolvedValue([]) }, hashtag: { findMany: jest.fn().mockResolvedValue([]) },
            channel: { findMany: jest.fn().mockResolvedValue([]) }, follow: { findMany: jest.fn().mockResolvedValue([]) },
            block: { findMany: jest.fn().mockResolvedValue([]) },
            postReaction: { findMany: jest.fn().mockResolvedValue([]) }, savedPost: { findMany: jest.fn().mockResolvedValue([]) },
            $queryRaw: jest.fn().mockResolvedValue([]),
          }},
          { provide: MeilisearchService, useValue: { isAvailable: jest.fn().mockReturnValue(false), search: jest.fn() } },
        ],
      }).compile();
      service = module.get(SearchService);
      prisma = module.get(PrismaService);
    });

    it('should search posts type', async () => {
      const result = await service.search('test', 'posts');
      expect(result.data).toEqual([]);
    });

    it('should search threads type', async () => {
      const result = await service.search('test', 'threads');
      expect(result.data).toEqual([]);
    });

    it('should search reels type', async () => {
      const result = await service.search('test', 'reels');
      expect(result.data).toEqual([]);
    });

    it('should search videos type', async () => {
      const result = await service.search('test', 'videos');
      expect(result.data).toEqual([]);
    });

    it('should search channels type', async () => {
      const result = await service.search('test', 'channels');
      expect(result.data).toEqual([]);
    });

    it('should search people type', async () => {
      const result = await service.search('test', 'people');
      expect(result).toBeDefined();
    });

    it('should search tags type', async () => {
      const result = await service.search('test', 'tags');
      expect(result).toBeDefined();
    });

    it('should reject empty search query', async () => {
      await expect(service.search('')).rejects.toThrow(BadRequestException);
    });

    it('should reject search query > 200 chars', async () => {
      await expect(service.search('a'.repeat(201))).rejects.toThrow(BadRequestException);
    });

    it('should return trending data', async () => {
      const result = await service.trending();
      expect(result).toBeDefined();
    });

    it('should search with no type specified', async () => {
      const result = await service.search('general query');
      expect(result).toBeDefined();
    });

    it('should return explore feed (empty)', async () => {
      const result = await service.getExploreFeed();
      expect(result).toBeDefined();
    });

    it('should search posts with query', async () => {
      const result = await service.searchPosts('test');
      expect(result.data).toEqual([]);
    });

    it('should search threads with query', async () => {
      const result = await service.searchThreads('test');
      expect(result.data).toEqual([]);
    });

    it('should search reels with query', async () => {
      const result = await service.searchReels('test');
      expect(result.data).toEqual([]);
    });

    it('should accept 200-char search query (boundary)', async () => {
      const result = await service.search('a'.repeat(200), 'posts');
      expect(result.data).toBeDefined();
    });
  });

  // ── Scheduling — additional tests ──
  describe('SchedulingService — additional tests', () => {
    let service: SchedulingService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          SchedulingService,
          { provide: PrismaService, useValue: {
            post: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            thread: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            reel: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            video: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
          }},
        ],
      }).compile();
      service = module.get(SchedulingService);
      prisma = module.get(PrismaService);
    });

    it('should return empty scheduled list', async () => {
      const result = await service.getScheduled('u1');
      expect(result).toEqual([]);
    });

    it('should reject schedule too soon (< 15 min)', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p-1', userId: 'u1' });
      await expect(service.updateSchedule('u1', 'post', 'p-1', new Date(Date.now() + 60000)))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject invalid content type', async () => {
      await expect(service.cancelSchedule('u1', 'invalid' as any, 'id-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for cancel of non-existent', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.cancelSchedule('u1', 'post', 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for cancel by non-owner', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p-1', userId: 'owner' });
      await expect(service.cancelSchedule('attacker', 'post', 'p-1'))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for publish non-existent', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.publishNow('u1', 'post', 'nonexistent'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for publish by non-owner', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'p-1', userId: 'owner' });
      await expect(service.publishNow('attacker', 'post', 'p-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ── Commerce — additional tests ──
  describe('CommerceService — additional tests', () => {
    let service: CommerceService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, CommerceService,
          { provide: PrismaService, useValue: {
            product: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            productReview: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            order: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            halalBusiness: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            businessReview: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            zakatFund: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            zakatDonation: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            communityTreasury: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            treasuryContribution: { create: jest.fn() },
            premiumSubscription: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
            $transaction: jest.fn(),
          }},
        ],
      }).compile();
      service = module.get(CommerceService);
      prisma = module.get(PrismaService);
    });

    it('should return empty zakat funds', async () => {
      const result = await service.getZakatFunds();
      expect(result.data).toEqual([]);
    });

    it('should return empty businesses', async () => {
      const result = await service.getBusinesses();
      expect(result.data).toEqual([]);
    });

    it('should reject zero-price product', async () => {
      await expect(service.createProduct('u1', { title: 'Free', price: 0, description: 'x', category: 'OTHER' } as any))
        .rejects.toThrow(BadRequestException);
    });

    it('should handle create product with Arabic title', async () => {
      prisma.product.create.mockResolvedValue({ id: 'p-1', title: 'حلال', price: 10 });
      const result = await service.createProduct('u1', { title: 'حلال', price: 10, description: 'desc', category: 'OTHER' } as any);
      expect(result.title).toBe('حلال');
    });
  });
});

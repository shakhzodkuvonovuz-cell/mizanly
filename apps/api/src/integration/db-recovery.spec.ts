/**
 * Task 80: DB connection failure tests across core services.
 * Verifies every service throws a catchable exception when DB fails.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';
import { PostsService } from '../modules/posts/posts.service';
import { ThreadsService } from '../modules/threads/threads.service';
import { ReelsService } from '../modules/reels/reels.service';
import { FollowsService } from '../modules/follows/follows.service';
import { GamificationService } from '../modules/gamification/gamification.service';
import { BookmarksService } from '../modules/bookmarks/bookmarks.service';
import { EventsService } from '../modules/events/events.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { StreamService } from '../modules/stream/stream.service';
import { DraftsService } from '../modules/drafts/drafts.service';

describe('DB Connection Failure Recovery (Task 80)', () => {
  const dbError = new Error('Connection refused');

  describe('PostsService — DB error', () => {
    let service: PostsService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          PostsService,
          {
            provide: PrismaService,
            useValue: {
              post: { findUnique: jest.fn().mockRejectedValue(dbError), findMany: jest.fn().mockRejectedValue(dbError), create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
              postReaction: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
              follow: { findMany: jest.fn() }, block: { findMany: jest.fn() }, mute: { findMany: jest.fn() },
              hashtag: { upsert: jest.fn() }, user: { update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
              comment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
              commentReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
              savedPost: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
              feedDismissal: { upsert: jest.fn() }, report: { create: jest.fn() },
              circleMember: { findMany: jest.fn().mockResolvedValue([]) },
              $transaction: jest.fn(), $executeRaw: jest.fn(),
            },
          },
          { provide: NotificationsService, useValue: { create: jest.fn() } },
          { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn() } },
        ],
      }).compile();
      service = module.get(PostsService);
    });

    it('getById should throw on DB error', async () => {
      await expect(service.getById('post-1')).rejects.toThrow();
    });
  });

  describe('FollowsService — DB error', () => {
    let service: FollowsService;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          FollowsService,
          {
            provide: PrismaService,
            useValue: {
              user: { findUnique: jest.fn().mockRejectedValue(dbError), findMany: jest.fn(), update: jest.fn() },
              follow: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
              followRequest: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
              block: { findFirst: jest.fn() },
              $transaction: jest.fn(), $executeRaw: jest.fn(),
            },
          },
          { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
        ],
      }).compile();
      service = module.get(FollowsService);
    });

    it('follow should throw on DB error (user lookup fails)', async () => {
      await expect(service.follow('user-a', 'user-b')).rejects.toThrow();
    });
  });

  describe('GamificationService — DB error', () => {
    let service: GamificationService;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          GamificationService,
          {
            provide: PrismaService,
            useValue: {
              userXP: { findUnique: jest.fn().mockRejectedValue(dbError), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
              xPHistory: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              userStreak: { findMany: jest.fn().mockRejectedValue(dbError), upsert: jest.fn() },
              achievement: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
              userAchievement: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findUnique: jest.fn() },
              challenge: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
              challengeParticipant: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
              series: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
              seriesEpisode: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              seriesFollower: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              seriesProgress: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
              profileCustomization: { findUnique: jest.fn(), upsert: jest.fn() },
              user: { findMany: jest.fn().mockResolvedValue([]) },
              $transaction: jest.fn(), $executeRaw: jest.fn(),
            },
          },
        ],
      }).compile();
      service = module.get(GamificationService);
    });

    it('getXP should throw on DB error', async () => {
      await expect(service.getXP('user-1')).rejects.toThrow();
    });

    it('getStreaks should throw on DB error', async () => {
      await expect(service.getStreaks('user-1')).rejects.toThrow();
    });
  });

  describe('EventsService — DB error', () => {
    let service: EventsService;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          EventsService,
          {
            provide: PrismaService,
            useValue: {
              event: { findUnique: jest.fn().mockRejectedValue(dbError), findMany: jest.fn().mockRejectedValue(dbError), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
              eventRSVP: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), upsert: jest.fn(), groupBy: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
              user: { findUnique: jest.fn() },
            },
          },
        ],
      }).compile();
      service = module.get(EventsService);
    });

    it('getEvent should throw on DB error', async () => {
      await expect(service.getEvent('event-1', 'user-1')).rejects.toThrow();
    });

    it('listEvents should throw on DB error', async () => {
      await expect(service.listEvents('user-1')).rejects.toThrow();
    });
  });

  describe('BookmarksService — DB error', () => {
    let service: BookmarksService;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders,
          BookmarksService,
          {
            provide: PrismaService,
            useValue: {
              savedPost: { findMany: jest.fn().mockRejectedValue(dbError), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), update: jest.fn(), groupBy: jest.fn() },
              threadBookmark: { findMany: jest.fn().mockRejectedValue(dbError), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
              videoBookmark: { findMany: jest.fn().mockRejectedValue(dbError), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
              post: { findUnique: jest.fn(), update: jest.fn() },
              thread: { findUnique: jest.fn(), update: jest.fn() },
              video: { findUnique: jest.fn() },
              $transaction: jest.fn(), $executeRaw: jest.fn(),
            },
          },
        ],
      }).compile();
      service = module.get(BookmarksService);
    });

    it('getSavedPosts should throw on DB error', async () => {
      await expect(service.getSavedPosts('user-1')).rejects.toThrow();
    });

    it('getSavedThreads should throw on DB error', async () => {
      await expect(service.getSavedThreads('user-1')).rejects.toThrow();
    });

    it('getSavedVideos should throw on DB error', async () => {
      await expect(service.getSavedVideos('user-1')).rejects.toThrow();
    });
  });

  describe('DraftsService — DB error', () => {
    let service: DraftsService;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          DraftsService,
          {
            provide: PrismaService,
            useValue: {
              draftPost: {
                findUnique: jest.fn().mockRejectedValue(dbError),
                findMany: jest.fn().mockRejectedValue(dbError),
                create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(),
              },
            },
          },
        ],
      }).compile();
      service = module.get(DraftsService);
    });

    it('getDrafts should throw on DB error', async () => {
      await expect(service.getDrafts('user-1')).rejects.toThrow();
    });

    it('getDraft should throw on DB error', async () => {
      await expect(service.getDraft('draft-1', 'user-1')).rejects.toThrow();
    });
  });
});

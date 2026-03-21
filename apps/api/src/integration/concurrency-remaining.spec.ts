/**
 * Remaining concurrency + error recovery tests — Tasks 80-95 coverage.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';

import { PostsService } from '../modules/posts/posts.service';
import { ThreadsService } from '../modules/threads/threads.service';
import { ReelsService } from '../modules/reels/reels.service';
import { VideosService } from '../modules/videos/videos.service';
import { FollowsService } from '../modules/follows/follows.service';
import { GamificationService } from '../modules/gamification/gamification.service';
import { BookmarksService } from '../modules/bookmarks/bookmarks.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { StreamService } from '../modules/stream/stream.service';

describe('Concurrency + Error Recovery — remaining tests', () => {
  // ── Posts — additional concurrency ──
  describe('PostsService — additional concurrency', () => {
    let service: PostsService;
    let prisma: any;
    const mockPost = { id: 'p-1', userId: 'owner', content: 'test', postType: 'TEXT', visibility: 'PUBLIC', mediaUrls: [], mediaTypes: [], isRemoved: false, commentsDisabled: false, likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0, viewsCount: 0 };

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, PostsService,
          { provide: PrismaService, useValue: {
            $transaction: jest.fn().mockResolvedValue([{}, {}]), $executeRaw: jest.fn(),
            post: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            postReaction: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            follow: { findMany: jest.fn().mockResolvedValue([]) }, block: { findMany: jest.fn().mockResolvedValue([]) }, mute: { findMany: jest.fn().mockResolvedValue([]) },
            hashtag: { upsert: jest.fn() }, user: { update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            comment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            commentReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            savedPost: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
            feedDismissal: { upsert: jest.fn() }, report: { create: jest.fn() }, circleMember: { findMany: jest.fn().mockResolvedValue([]) },
          }},
          { provide: NotificationsService, useValue: { create: jest.fn() } },
          { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn() } },
        ],
      }).compile();
      service = module.get(PostsService);
      prisma = module.get(PrismaService);
    });

    it('should handle getComments with 0 comments', async () => {
      prisma.comment.findMany.mockResolvedValue([]);
      const result = await service.getComments('p-1');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should handle getCommentReplies with 0 replies', async () => {
      prisma.comment.findMany.mockResolvedValue([]);
      const result = await service.getCommentReplies('c-1');
      expect(result.data).toEqual([]);
    });

    it('should handle concurrent getFeed calls', async () => {
      prisma.follow.findMany.mockResolvedValue(Array.from({ length: 15 }, (_, i) => ({ followingId: `u${i}` })));
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([]);

      const promises = Array.from({ length: 5 }, () => service.getFeed('user-1', 'following'));
      const results = await Promise.allSettled(promises);
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    });

    it('should handle dismiss idempotently', async () => {
      prisma.feedDismissal.upsert.mockResolvedValue({});
      const [r1, r2] = await Promise.allSettled([
        service.dismiss('p-1', 'u1'),
        service.dismiss('p-1', 'u1'),
      ]);
      expect(r1.status).toBe('fulfilled');
      expect(r2.status).toBe('fulfilled');
    });

    it('should handle report creation', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.report.create.mockResolvedValue({});
      const result = await service.report('p-1', 'u1', 'SPAM');
      expect(result.reported).toBe(true);
    });

    it('should handle getShareLink', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPost);
      const result = await service.getShareLink('p-1');
      expect(result.url).toContain('p-1');
    });

    it('should throw NotFoundException for share link of removed post', async () => {
      prisma.post.findUnique.mockResolvedValue({ ...mockPost, isRemoved: true });
      await expect(service.getShareLink('p-1')).rejects.toThrow();
    });

    it('should handle archivePost ownership check', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPost);
      await expect(service.archivePost('p-1', 'not-owner')).rejects.toThrow(ForbiddenException);
    });

    it('should handle hideComment ownership check', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'c-1', post: { userId: 'owner' } });
      await expect(service.hideComment('c-1', 'not-owner')).rejects.toThrow(ForbiddenException);
    });

    it('should handle unhideComment ownership check', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'c-1', post: { userId: 'owner' } });
      await expect(service.unhideComment('c-1', 'not-owner')).rejects.toThrow(ForbiddenException);
    });

    it('should handle getHiddenComments ownership check', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPost);
      await expect(service.getHiddenComments('p-1', 'not-owner')).rejects.toThrow(ForbiddenException);
    });

    it('should handle unreact when no reaction exists', async () => {
      prisma.postReaction.findUnique.mockResolvedValue(null);
      const result = await service.unreact('p-1', 'u1');
      expect(result.reaction).toBeNull();
    });
  });

  // ── Threads — additional tests ──
  describe('ThreadsService — additional tests', () => {
    let service: ThreadsService;
    let prisma: any;
    const mockThread = { id: 't-1', userId: 'owner', isRemoved: false, isChainHead: true, visibility: 'PUBLIC', mentions: [], replyPermission: 'everyone' };

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, ThreadsService,
          { provide: PrismaService, useValue: {
            thread: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
            threadReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            threadReply: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), update: jest.fn() },
            threadReplyLike: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            threadBookmark: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            follow: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            hashtag: { upsert: jest.fn() }, report: { create: jest.fn() }, feedDismissal: { upsert: jest.fn() },
            pollOption: { findUnique: jest.fn(), update: jest.fn() },
            pollVote: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
            poll: { update: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([{}, {}]), $executeRaw: jest.fn(),
          }},
          { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
          { provide: 'REDIS', useValue: { get: jest.fn(), setex: jest.fn(), del: jest.fn() } },
        ],
      }).compile();
      service = module.get(ThreadsService);
      prisma = module.get(PrismaService);
    });

    it('should handle getById for removed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...mockThread, isRemoved: true });
      await expect(service.getById('t-1')).rejects.toThrow();
    });

    it('should handle getReplies with 0 replies', async () => {
      prisma.threadReply.findMany.mockResolvedValue([]);
      const result = await service.getReplies('t-1');
      expect(result.data).toEqual([]);
    });

    it('should handle canReply for everyone permission', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThread);
      const result = await service.canReply('t-1', 'any-user');
      expect(result.canReply).toBe(true);
    });

    it('should handle canReply for none permission', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...mockThread, replyPermission: 'none' });
      const result = await service.canReply('t-1', 'any-user');
      expect(result.canReply).toBe(false);
    });

    it('should handle canReply for author', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...mockThread, replyPermission: 'none' });
      const result = await service.canReply('t-1', 'owner');
      expect(result.canReply).toBe(true);
      expect(result.reason).toBe('author');
    });

    it('should handle getShareLink', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThread);
      const result = await service.getShareLink('t-1');
      expect(result.url).toContain('t-1');
    });

    it('should throw NotFoundException for removed thread share link', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...mockThread, isRemoved: true });
      await expect(service.getShareLink('t-1')).rejects.toThrow();
    });

    it('should handle isBookmarked check', async () => {
      prisma.threadBookmark.findUnique.mockResolvedValue(null);
      const result = await service.isBookmarked('t-1', 'u1');
      expect(result.bookmarked).toBe(false);
    });

    it('should handle unlike with no existing reaction', async () => {
      prisma.threadReaction.findUnique.mockResolvedValue(null);
      await expect(service.unlike('t-1', 'u1')).rejects.toThrow();
    });

    it('should handle self-repost rejection', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThread);
      await expect(service.repost('t-1', 'owner')).rejects.toThrow(BadRequestException);
    });

    it('should handle duplicate repost detection', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThread);
      prisma.thread.findFirst.mockResolvedValue({ id: 'existing-repost' });
      await expect(service.repost('t-1', 'u2')).rejects.toThrow(ConflictException);
    });

    it('should handle unbookmark with no existing bookmark', async () => {
      prisma.threadBookmark.findUnique.mockResolvedValue(null);
      await expect(service.unbookmark('t-1', 'u1')).rejects.toThrow();
    });
  });

  // ── Bookmarks — additional tests ──
  describe('BookmarksService — additional tests', () => {
    let service: BookmarksService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, BookmarksService,
          { provide: PrismaService, useValue: {
            savedPost: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), update: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
            threadBookmark: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            videoBookmark: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            post: { findUnique: jest.fn(), update: jest.fn() }, thread: { findUnique: jest.fn(), update: jest.fn() }, video: { findUnique: jest.fn() },
            $transaction: jest.fn(), $executeRaw: jest.fn(),
          }},
        ],
      }).compile();
      service = module.get(BookmarksService);
      prisma = module.get(PrismaService);
    });

    it('should throw NotFoundException when saving non-existent post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.savePost('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when saving non-existent thread', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);
      await expect(service.saveThread('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when saving non-existent video', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.saveVideo('u1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should return per-user post saved status', async () => {
      prisma.savedPost.findUnique.mockResolvedValue({ userId: 'u1', postId: 'p-1' });
      const result = await service.isPostSaved('u1', 'p-1');
      expect(result.saved).toBe(true);
    });

    it('should return per-user thread saved status', async () => {
      prisma.threadBookmark.findUnique.mockResolvedValue({ userId: 'u1', threadId: 't-1' });
      const result = await service.isThreadSaved('u1', 't-1');
      expect(result.saved).toBe(true);
    });

    it('should return per-user video saved status', async () => {
      prisma.videoBookmark.findUnique.mockResolvedValue({ userId: 'u1', videoId: 'v-1' });
      const result = await service.isVideoSaved('u1', 'v-1');
      expect(result.saved).toBe(true);
    });

    it('should return empty saved posts', async () => {
      const result = await service.getSavedPosts('u1');
      expect(result.data).toEqual([]);
    });

    it('should return empty saved threads', async () => {
      const result = await service.getSavedThreads('u1');
      expect(result.data).toEqual([]);
    });

    it('should return empty saved videos', async () => {
      const result = await service.getSavedVideos('u1');
      expect(result.data).toEqual([]);
    });

    it('should return collections using groupBy', async () => {
      const result = await service.getCollections('u1');
      expect(result).toBeDefined();
    });
  });

  // ── Follows — additional tests ──
  describe('FollowsService — additional tests', () => {
    let service: FollowsService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, FollowsService,
          { provide: PrismaService, useValue: {
            user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            follow: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            followRequest: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
            block: { findFirst: jest.fn().mockResolvedValue(null) },
            $transaction: jest.fn().mockResolvedValue([{}, {}, {}]), $executeRaw: jest.fn(),
          }},
          { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
        ],
      }).compile();
      service = module.get(FollowsService);
      prisma = module.get(PrismaService);
    });

    it('should check if following (returns truthy)', async () => {
      prisma.follow.findUnique.mockResolvedValue({ followerId: 'u1', followingId: 'u2' });
      const result = await service.checkFollowing('u1', 'u2');
      expect(result).toBeTruthy();
    });

    it('should check not-following state', async () => {
      prisma.follow.findUnique.mockResolvedValue(null);
      const result = await service.checkFollowing('u1', 'u2');
      expect(result).toBeDefined();
    });

    it('should get suggestions', async () => {
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      const result = await service.getSuggestions('u1');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException for followers of non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getFollowers('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for following of non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getFollowing('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Gamification — additional tests ──
  describe('GamificationService — additional tests', () => {
    let service: GamificationService;
    let prisma: any;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, GamificationService,
          { provide: PrismaService, useValue: {
            userXP: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
            xPHistory: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            userStreak: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
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
          }},
        ],
      }).compile();
      service = module.get(GamificationService);
      prisma = module.get(PrismaService);
    });

    it('should create new XP record for first-time user', async () => {
      prisma.userXP.findUnique.mockResolvedValue(null);
      prisma.userXP.create.mockResolvedValue({ userId: 'u1', totalXP: 0, level: 1 });
      const result = await service.getXP('u1');
      expect(result.totalXP).toBe(0);
      expect(result.level).toBe(1);
    });

    it('should award XP with atomic upsert', async () => {
      prisma.userXP.upsert.mockResolvedValue({ id: 'xp-1', userId: 'u1', totalXP: 10, level: 1 });
      prisma.xPHistory.create.mockResolvedValue({});
      const result = await service.awardXP('u1', 'post_created');
      expect(result).toBeDefined();
      expect(prisma.userXP.upsert).toHaveBeenCalled();
    });

    it('should return empty achievements list', async () => {
      const result = await service.getAchievements('u1');
      expect(result).toBeDefined();
    });

    it('should return empty challenges', async () => {
      const result = await service.getChallenges();
      expect(result.data).toEqual([]);
    });

    it('should return empty my challenges', async () => {
      const result = await service.getMyChallenges('u1');
      expect(result).toEqual([]);
    });

    it('should return null for unlocking non-existent achievement', async () => {
      prisma.achievement.findUnique.mockResolvedValue(null);
      const result = await service.unlockAchievement('u1', 'nonexistent');
      expect(result).toBeNull();
    });

    it('should handle profile customization query', async () => {
      prisma.profileCustomization.findUnique.mockResolvedValue({ userId: 'u1', badge: null });
      const result = await service.getProfileCustomization('u1');
      expect(result).toBeDefined();
    });

    it('should discover series (empty)', async () => {
      const result = await service.getDiscoverSeries();
      expect(result.data).toEqual([]);
    });

    it('should get continue watching (empty)', async () => {
      const result = await service.getContinueWatching('u1');
      expect(result).toEqual([]);
    });
  });
});

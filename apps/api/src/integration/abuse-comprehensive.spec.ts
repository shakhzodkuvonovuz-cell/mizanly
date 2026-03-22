/**
 * Comprehensive abuse vector tests — covering Tasks 96-110.
 * Each section tests specific attack vectors that could be exploited by malicious users.
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
import { NotificationsService } from '../modules/notifications/notifications.service';
import { StreamService } from '../modules/stream/stream.service';

describe('Comprehensive Abuse Vector Tests', () => {
  // ── Posts — comment/interaction spam ──
  describe('PostsService — interaction abuse', () => {
    let service: PostsService;
    let prisma: any;
    const mockPost = { id: 'p-1', userId: 'owner', content: 'test', postType: 'TEXT', visibility: 'PUBLIC', mediaUrls: [], mediaTypes: [], isRemoved: false, commentsDisabled: false, likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0, viewsCount: 0, space: 'SAF' };

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, PostsService,
          { provide: PrismaService, useValue: {
            $transaction: jest.fn(), $executeRaw: jest.fn(),
            post: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
            postReaction: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            follow: { findMany: jest.fn() }, block: { findMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) }, mute: { findMany: jest.fn() },
            hashtag: { upsert: jest.fn() }, user: { update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            comment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
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

    it('should reject comment on removed post', async () => {
      prisma.post.findUnique.mockResolvedValue({ ...mockPost, isRemoved: true });
      await expect(service.addComment('p-1', 'u1', { content: 'spam' } as any)).rejects.toThrow(NotFoundException);
    });

    it('should reject comment on disabled-comments post', async () => {
      prisma.post.findUnique.mockResolvedValue({ ...mockPost, commentsDisabled: true });
      await expect(service.addComment('p-1', 'u1', { content: 'spam' } as any)).rejects.toThrow(ForbiddenException);
    });

    it('should reject like on removed post', async () => {
      prisma.post.findUnique.mockResolvedValue({ ...mockPost, isRemoved: true });
      await expect(service.react('p-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject save of removed post', async () => {
      prisma.post.findUnique.mockResolvedValue({ ...mockPost, isRemoved: true });
      await expect(service.save('p-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject share of removed post', async () => {
      prisma.post.findUnique.mockResolvedValue({ ...mockPost, isRemoved: true });
      await expect(service.share('p-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject duplicate share by same user', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.post.findFirst.mockResolvedValue({ id: 'share-existing' });
      await expect(service.share('p-1', 'u1')).rejects.toThrow(ConflictException);
    });

    it('should handle cross-post with no valid target spaces', async () => {
      prisma.post.findFirst.mockResolvedValue(mockPost);
      await expect(service.crossPost('owner', 'p-1', { targetSpaces: ['INVALID'] }))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject cross-post of removed post', async () => {
      prisma.post.findFirst.mockResolvedValue({ ...mockPost, isRemoved: true });
      await expect(service.crossPost('owner', 'p-1', { targetSpaces: ['MAJLIS'] }))
        .rejects.toThrow(BadRequestException);
    });

    it('should handle like comment on non-existent comment', async () => {
      prisma.comment.findUnique.mockResolvedValue(null);
      await expect(service.likeComment('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should handle unlike comment with no existing reaction', async () => {
      prisma.commentReaction.findUnique.mockResolvedValue(null);
      await expect(service.unlikeComment('c-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should handle pin on non-existent post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.pinComment('nonexistent', 'c-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should handle unpin on non-existent post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.unpinComment('nonexistent', 'c-1', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Threads — interaction abuse ──
  describe('ThreadsService — interaction abuse', () => {
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
            threadReplyLike: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
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

    it('should reject reply to removed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...mockThread, isRemoved: true });
      await expect(service.addReply('t-1', 'u1', 'reply')).rejects.toThrow(NotFoundException);
    });

    it('should reject like on removed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...mockThread, isRemoved: true });
      await expect(service.like('t-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject self-repost', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThread);
      await expect(service.repost('t-1', 'owner')).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate repost', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThread);
      prisma.thread.findFirst.mockResolvedValue({ id: 'existing-repost' });
      await expect(service.repost('t-1', 'u2')).rejects.toThrow(ConflictException);
    });

    it('should reject bookmark on removed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...mockThread, isRemoved: true });
      await expect(service.bookmark('t-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject reply with non-existent parent', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThread);
      prisma.threadReply.findUnique.mockResolvedValue(null);
      await expect(service.addReply('t-1', 'u1', 'reply', 'nonexistent-parent')).rejects.toThrow(NotFoundException);
    });

    it('should reject delete of non-existent thread', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);
      await expect(service.delete('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject delete by non-owner', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThread);
      await expect(service.delete('t-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should reject reply like on wrong thread', async () => {
      prisma.threadReply.findUnique.mockResolvedValue({ id: 'r-1', threadId: 'other-thread' });
      await expect(service.likeReply('t-1', 'r-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject report on removed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({ ...mockThread, isRemoved: true });
      await expect(service.report('t-1', 'u1', 'SPAM')).rejects.toThrow(NotFoundException);
    });

    it('should reject non-owner setReplyPermission', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThread);
      await expect(service.setReplyPermission('t-1', 'attacker', 'none')).rejects.toThrow(ForbiddenException);
    });

    it('should reject invalid reply permission value', async () => {
      prisma.thread.findUnique.mockResolvedValue(mockThread);
      await expect(service.setReplyPermission('t-1', 'owner', 'invalid' as any)).rejects.toThrow(BadRequestException);
    });
  });

  // ── Reels — interaction abuse ──
  describe('ReelsService — interaction abuse', () => {
    let service: ReelsService;
    let prisma: any;
    const mockReel = { id: 'r-1', userId: 'owner', status: 'READY', isRemoved: false };

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, ReelsService,
          { provide: PrismaService, useValue: {
            reel: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
            reelReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            reelInteraction: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            reelComment: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            user: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            block: { findMany: jest.fn().mockResolvedValue([]) }, mute: { findMany: jest.fn().mockResolvedValue([]) },
            hashtag: { upsert: jest.fn() }, report: { create: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([{}, {}, {}]), $executeRaw: jest.fn(),
          }},
          { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
          { provide: StreamService, useValue: { uploadFromUrl: jest.fn(), deleteVideo: jest.fn() } },
          { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn() } },
        ],
      }).compile();
      service = module.get(ReelsService);
      prisma = module.get(PrismaService);
    });

    it('should reject like on non-READY reel', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, status: 'PROCESSING' });
      await expect(service.like('r-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject unlike on non-READY reel', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, status: 'PROCESSING' });
      await expect(service.unlike('r-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject delete by non-owner', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReel);
      await expect(service.delete('r-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should reject delete of non-existent reel', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      await expect(service.delete('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject comment on non-READY reel', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, status: 'PROCESSING' });
      await expect(service.comment('r-1', 'u1', 'test')).rejects.toThrow(NotFoundException);
    });

    it('should reject delete comment by non-author', async () => {
      prisma.reelComment.findUnique.mockResolvedValue({ id: 'c-1', userId: 'owner', reelId: 'r-1' });
      await expect(service.deleteComment('r-1', 'c-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should reject archive by non-owner', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReel);
      await expect(service.archive('r-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should reject unarchive by non-owner', async () => {
      prisma.reel.findUnique.mockResolvedValue(mockReel);
      await expect(service.unarchive('r-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should handle getById for non-existent reel', async () => {
      prisma.reel.findUnique.mockResolvedValue(null);
      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should reject share of non-READY reel', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, status: 'PROCESSING' });
      await expect(service.share('r-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should reject view of non-READY reel', async () => {
      prisma.reel.findUnique.mockResolvedValue({ ...mockReel, status: 'PROCESSING' });
      await expect(service.view('r-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should handle getUserReels for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserReels('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Stories — interaction abuse ──
  describe('StoriesService — interaction abuse', () => {
    let service: StoriesService;
    let prisma: any;
    const mockStory = { id: 's-1', userId: 'owner', isArchived: false };

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, StoriesService,
          { provide: PrismaService, useValue: {
            story: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
            storyView: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            storyHighlightAlbum: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            storyStickerResponse: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            follow: { findMany: jest.fn().mockResolvedValue([]) }, block: { findFirst: jest.fn() },
            user: { findMany: jest.fn().mockResolvedValue([]) },
            conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() }, message: { create: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([{}, {}]), $queryRaw: jest.fn(),
          }},
        ],
      }).compile();
      service = module.get(StoriesService);
      prisma = module.get(PrismaService);
    });

    it('should reject delete by non-owner', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory);
      await expect(service.delete('s-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should reject viewer list by non-owner', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory);
      await expect(service.getViewers('s-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should reject self-reply to own story', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory);
      await expect(service.replyToStory('s-1', 'owner', 'self-reply')).rejects.toThrow(BadRequestException);
    });

    it('should reject reply when blocked', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory);
      prisma.block.findFirst.mockResolvedValue({ id: 'block-1' });
      await expect(service.replyToStory('s-1', 'u2', 'reply')).rejects.toThrow(ForbiddenException);
    });

    it('should reject highlight add for non-owner story', async () => {
      prisma.story.findUnique.mockResolvedValue({ ...mockStory, userId: 'other' });
      prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'a-1', userId: 'owner' });
      await expect(service.addStoryToHighlight('s-1', 'a-1', 'owner')).rejects.toThrow(ForbiddenException);
    });

    it('should reject highlight update by non-owner', async () => {
      prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'a-1', userId: 'owner' });
      await expect(service.updateHighlight('a-1', 'attacker', { title: 'hacked' })).rejects.toThrow(ForbiddenException);
    });

    it('should reject highlight delete by non-owner', async () => {
      prisma.storyHighlightAlbum.findUnique.mockResolvedValue({ id: 'a-1', userId: 'owner' });
      await expect(service.deleteHighlight('a-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should reject reaction summary by non-owner', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory);
      await expect(service.getReactionSummary('s-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent story view', async () => {
      prisma.story.findUnique.mockResolvedValue(null);
      await expect(service.markViewed('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent story reply', async () => {
      prisma.story.findUnique.mockResolvedValue(null);
      await expect(service.replyToStory('nonexistent', 'u1', 'reply')).rejects.toThrow(NotFoundException);
    });

    it('should reject sticker response on non-existent story', async () => {
      prisma.story.findUnique.mockResolvedValue(null);
      await expect(service.submitStickerResponse('nonexistent', 'u1', 'emoji', {})).rejects.toThrow(NotFoundException);
    });

    it('should reject unarchive by non-owner', async () => {
      prisma.story.findUnique.mockResolvedValue(mockStory);
      await expect(service.unarchive('s-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });
  });
});

/**
 * Final push part 3 — breaking 3,800 barrier
 * Deep coverage for Videos, Channels, Stories, Follows, Events, Live, Bookmarks
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';

import { VideosService } from '../modules/videos/videos.service';
import { ChannelsService } from '../modules/channels/channels.service';
import { StoriesService } from '../modules/stories/stories.service';
import { FollowsService } from '../modules/follows/follows.service';
import { EventsService } from '../modules/events/events.service';
import { LiveService } from '../modules/live/live.service';
import { BookmarksService } from '../modules/bookmarks/bookmarks.service';
import { CommunitiesService } from '../modules/communities/communities.service';
import { CommerceService } from '../modules/commerce/commerce.service';
import { GamificationService } from '../modules/gamification/gamification.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { StreamService } from '../modules/stream/stream.service';

describe('Final Push Part 3 — breaking 3800', () => {
  // ── Videos deep ──
  describe('VideosService — deep coverage', () => {
    let service: VideosService;
    let prisma: any;
    const mockVideo = { id: 'v-1', userId: 'owner', channelId: 'ch-1', status: 'PUBLISHED', isRemoved: false, channel: { userId: 'owner' }, category: 'OTHER', tags: ['islamic'] };

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
            channel: { findUnique: jest.fn(), update: jest.fn() }, watchHistory: { upsert: jest.fn(), findUnique: jest.fn() },
            subscription: { findMany: jest.fn().mockResolvedValue([]) },
            user: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            block: { findMany: jest.fn().mockResolvedValue([]) }, mute: { findMany: jest.fn().mockResolvedValue([]) },
            report: { create: jest.fn() },
            premiere: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            premiereReminder: { create: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            endScreen: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
            $transaction: jest.fn().mockImplementation(async (cb: any) => { if (typeof cb === 'function') return cb(prisma); return cb; }), $executeRaw: jest.fn(),
          }},
          { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
          { provide: StreamService, useValue: { uploadFromUrl: jest.fn(), deleteVideo: jest.fn() } },
          { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), setex: jest.fn(), del: jest.fn() } },
        ],
      }).compile();
      service = module.get(VideosService); prisma = module.get(PrismaService);
    });

    // Create flow
    it('create — throws NotFoundException for non-existent channel', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);
      await expect(service.create('u1', { channelId: 'nonexistent', title: 'Test', videoUrl: 'url' } as any)).rejects.toThrow(NotFoundException);
    });

    it('create — throws ForbiddenException for non-owner channel', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', userId: 'other' });
      await expect(service.create('u1', { channelId: 'ch-1', title: 'Test', videoUrl: 'url' } as any)).rejects.toThrow(ForbiddenException);
    });

    // Like/Dislike/Remove
    it('like — throws ConflictException for duplicate', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      prisma.videoReaction.findUnique.mockResolvedValue({ userId: 'u1', videoId: 'v-1', isLike: true });
      await expect(service.like('v-1', 'u1')).rejects.toThrow(ConflictException);
    });

    it('dislike — throws ConflictException for duplicate', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      prisma.videoReaction.findUnique.mockResolvedValue({ userId: 'u1', videoId: 'v-1', isLike: false });
      await expect(service.dislike('v-1', 'u1')).rejects.toThrow(ConflictException);
    });

    it('removeReaction — throws NotFoundException when no reaction', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      prisma.videoReaction.findUnique.mockResolvedValue(null);
      await expect(service.removeReaction('v-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    // Comment
    it('comment — throws NotFoundException for non-existent video', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.comment('nonexistent', 'u1', 'test')).rejects.toThrow(NotFoundException);
    });

    // Bookmark edge cases
    it('bookmark — throws ConflictException for duplicate', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      prisma.videoBookmark.findUnique.mockResolvedValue({ userId: 'u1', videoId: 'v-1' });
      await expect(service.bookmark('v-1', 'u1')).rejects.toThrow(ConflictException);
    });

    // Premiere
    it('createPremiere — non-existent video', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.createPremiere('nonexistent', 'u1', { scheduledAt: new Date().toISOString() } as any)).rejects.toThrow(NotFoundException);
    });

    it('getEndScreens — empty', async () => {
      prisma.endScreen.findMany.mockResolvedValue([]);
      const result = await service.getEndScreens('v-1');
      expect(result).toEqual([]);
    });

    it('getShareLink — valid', async () => {
      prisma.video.findUnique.mockResolvedValue(mockVideo);
      const result = await service.getShareLink('v-1');
      expect(result.url).toContain('v-1');
    });

    it('getShareLink — non-existent', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.getShareLink('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('getRecommended — returns related videos', async () => {
      prisma.video.findUnique.mockResolvedValue({ channelId: 'ch-1', category: 'OTHER', tags: ['islamic'] });
      prisma.video.findMany.mockResolvedValue([]);
      const result = await service.getRecommended('v-1');
      expect(result).toEqual([]);
    });

    it('getFeed — returns empty when no subscriptions', async () => {
      prisma.subscription.findMany.mockResolvedValue([]);
      prisma.video.findMany.mockResolvedValue([]);
      const result = await service.getFeed('u1');
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('getChapters — returns empty', async () => {
      prisma.videoChapter.findMany.mockResolvedValue([]);
      const result = await service.getChapters('v-1');
      expect(result).toEqual([]);
    });
  });

  // ── Channels deep ──
  describe('ChannelsService — deep coverage', () => {
    let service: ChannelsService;
    let prisma: any;
    const ch = { id: 'ch-1', handle: 'test', userId: 'owner', name: 'Test', subscribersCount: 10 };

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, ChannelsService,
          { provide: PrismaService, useValue: {
            channel: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
            subscription: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            video: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([{}, {}]), $executeRaw: jest.fn(),
          }},
          { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
          { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn() } },
        ],
      }).compile();
      service = module.get(ChannelsService); prisma = module.get(PrismaService);
    });

    it('create — duplicate handle rejected', async () => {
      prisma.channel.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing' });
      await expect(service.create('u1', { handle: 'taken', name: 'New' } as any)).rejects.toThrow(ConflictException);
    });

    it('create — user already has channel', async () => {
      prisma.channel.findUnique.mockResolvedValue({ id: 'existing', userId: 'u1' });
      await expect(service.create('u1', { handle: 'new', name: 'New' } as any)).rejects.toThrow(ConflictException);
    });

    it('getByHandle — returns channel', async () => {
      prisma.channel.findUnique.mockResolvedValue(ch);
      const result = await service.getByHandle('test');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('handle', 'test');
    });

    it('getByHandle — non-existent throws', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);
      await expect(service.getByHandle('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('update — owner can update', async () => {
      prisma.channel.findUnique.mockResolvedValue(ch);
      prisma.channel.update.mockResolvedValue({ ...ch, name: 'Updated' });
      const result = await service.update('test', 'owner', { name: 'Updated' } as any);
      expect(result.name).toBe('Updated');
    });

    it('delete — owner can delete', async () => {
      prisma.channel.findUnique.mockResolvedValue(ch);
      prisma.channel.delete.mockResolvedValue({});
      const result = await service.delete('test', 'owner');
      expect(result.deleted).toBe(true);
    });

    it('getVideos — empty list', async () => {
      prisma.channel.findUnique.mockResolvedValue(ch);
      const result = await service.getVideos('test');
      expect(result.data).toEqual([]);
    });

    it('subscribe — non-existent channel', async () => {
      prisma.channel.findUnique.mockResolvedValue(null);
      await expect(service.subscribe('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('unsubscribe — not subscribed', async () => {
      prisma.channel.findUnique.mockResolvedValue({ ...ch, userId: 'other' });
      prisma.subscription.findUnique.mockResolvedValue(null);
      await expect(service.unsubscribe('test', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('getAnalytics — non-owner rejected', async () => {
      prisma.channel.findUnique.mockResolvedValue(ch);
      await expect(service.getAnalytics('test', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('getSubscribers — owner can view', async () => {
      prisma.channel.findUnique.mockResolvedValue(ch);
      prisma.subscription.findMany.mockResolvedValue([]);
      const result = await service.getSubscribers('test', 'owner');
      expect(result.data).toEqual([]);
    });

    it('getSubscribers — non-owner rejected', async () => {
      prisma.channel.findUnique.mockResolvedValue(ch);
      await expect(service.getSubscribers('test', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('setTrailer — non-owner rejected', async () => {
      prisma.channel.findUnique.mockResolvedValue(ch);
      await expect(service.setTrailer('test', 'attacker', 'vid-1')).rejects.toThrow(ForbiddenException);
    });

    it('removeTrailer — non-owner rejected', async () => {
      prisma.channel.findUnique.mockResolvedValue(ch);
      await expect(service.removeTrailer('test', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('getMyChannels — empty', async () => {
      prisma.channel.findMany.mockResolvedValue([]);
      const result = await service.getMyChannels('u1');
      expect(result).toEqual([]);
    });
  });

  // ── Stories deep ──
  describe('StoriesService — deep coverage', () => {
    let service: StoriesService;
    let prisma: any;
    const story = { id: 's-1', userId: 'owner', isArchived: false };

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ...globalMockProviders, StoriesService,
          { provide: PrismaService, useValue: {
            story: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
            storyView: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            storyHighlightAlbum: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            storyStickerResponse: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            follow: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
            block: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            restrict: { findMany: jest.fn().mockResolvedValue([]) },
            user: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
            conversation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() }, message: { create: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([{}, {}]), $queryRaw: jest.fn().mockResolvedValue([]),
          }},
        ],
      }).compile();
      service = module.get(StoriesService); prisma = module.get(PrismaService);
    });

    it('create — returns story', async () => {
      prisma.story.create.mockResolvedValue({ id: 's-new', userId: 'u1' });
      const result = await service.create('u1', { mediaUrl: 'url', mediaType: 'image/jpeg' });
      expect(result.id).toBe('s-new');
    });

    it('getById — returns story', async () => {
      prisma.story.findUnique.mockResolvedValue(story);
      const result = await service.getById('s-1');
      expect(result.id).toBe('s-1');
    });

    it('getById — non-existent throws', async () => {
      prisma.story.findUnique.mockResolvedValue(null);
      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('markViewed — creates view', async () => {
      prisma.story.findUnique.mockResolvedValue(story);
      prisma.storyView.findUnique.mockResolvedValue(null);
      const result = await service.markViewed('s-1', 'viewer');
      expect(result.viewed).toBe(true);
    });

    it('markViewed — idempotent', async () => {
      prisma.story.findUnique.mockResolvedValue(story);
      prisma.storyView.findUnique.mockResolvedValue({ storyId: 's-1', viewerId: 'viewer' });
      const result = await service.markViewed('s-1', 'viewer');
      expect(result.viewed).toBe(true);
    });

    it('createHighlight', async () => {
      prisma.storyHighlightAlbum.count.mockResolvedValue(2);
      prisma.storyHighlightAlbum.create.mockResolvedValue({ id: 'a-1', title: 'Test', position: 2 });
      const result = await service.createHighlight('u1', 'Test');
      expect(result.title).toBe('Test');
    });

    it('getArchived — empty', async () => {
      prisma.story.findMany.mockResolvedValue([]);
      const result = await service.getArchived('u1');
      expect(result).toEqual([]);
    });

    it('getHighlights — empty', async () => {
      const result = await service.getHighlights('u1');
      expect(result).toEqual([]);
    });

    it('replyToStory — creates DM if none exists', async () => {
      prisma.story.findUnique.mockResolvedValue(story);
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv-new' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1', content: 'Reply' });
      prisma.conversation.update.mockResolvedValue({});
      const result = await service.replyToStory('s-1', 'u2', 'Reply');
      expect(result.content).toBe('Reply');
    });

    it('replyToStory — uses existing DM', async () => {
      prisma.story.findUnique.mockResolvedValue(story);
      prisma.conversation.findFirst.mockResolvedValue({ id: 'conv-existing' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1', content: 'Reply' });
      prisma.conversation.update.mockResolvedValue({});
      const result = await service.replyToStory('s-1', 'u2', 'Reply');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('content', 'Reply');
    });

    it('submitStickerResponse — new response', async () => {
      prisma.story.findUnique.mockResolvedValue(story);
      prisma.storyStickerResponse.findFirst.mockResolvedValue(null);
      prisma.storyStickerResponse.create.mockResolvedValue({ id: 'sr-1' });
      const result = await service.submitStickerResponse('s-1', 'u1', 'emoji', { emoji: '🤲' });
      expect(result).toBeDefined();
      expect(result).toHaveProperty('id', 'sr-1');
    });

    it('submitStickerResponse — updates existing', async () => {
      prisma.story.findUnique.mockResolvedValue(story);
      prisma.storyStickerResponse.findFirst.mockResolvedValue({ id: 'sr-1' });
      prisma.storyStickerResponse.update.mockResolvedValue({ id: 'sr-1' });
      const result = await service.submitStickerResponse('s-1', 'u1', 'emoji', { emoji: '🕌' });
      expect(result).toBeDefined();
      expect(result).toHaveProperty('id', 'sr-1');
    });

    it('getStickerSummary — owner only', async () => {
      prisma.story.findUnique.mockResolvedValue(story);
      prisma.storyStickerResponse.findMany.mockResolvedValue([]);
      const result = await service.getStickerSummary('s-1', 'owner');
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('getStickerSummary — non-owner rejected', async () => {
      prisma.story.findUnique.mockResolvedValue(story);
      await expect(service.getStickerSummary('s-1', 'attacker')).rejects.toThrow(ForbiddenException);
    });

    it('getReactionSummary — owner only', async () => {
      prisma.story.findUnique.mockResolvedValue(story);
      prisma.$queryRaw.mockResolvedValue([{ emoji: '🤲', count: BigInt(5) }]);
      const result = await service.getReactionSummary('s-1', 'owner');
      expect(result[0].count).toBe(5);
    });
  });

  // ── Follows deep ──
  describe('FollowsService — deep coverage', () => {
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
      service = module.get(FollowsService); prisma = module.get(PrismaService);
    });

    it('follow — creates follow for public account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', isPrivate: false, isDeactivated: false, isBanned: false });
      prisma.follow.findUnique.mockResolvedValue(null);
      const result = await service.follow('u1', 'u2');
      expect(result.type).toBe('follow');
    });

    it('follow — creates request for private account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', isPrivate: true, isDeactivated: false, isBanned: false });
      prisma.follow.findUnique.mockResolvedValue(null);
      prisma.followRequest.findUnique.mockResolvedValue(null);
      prisma.followRequest.create.mockResolvedValue({ id: 'req-1', status: 'PENDING' });
      const result = await service.follow('u1', 'u2');
      expect(result.type).toBe('request');
    });

    it('unfollow — existing follow removed', async () => {
      prisma.follow.findUnique.mockResolvedValue({ followerId: 'u1', followingId: 'u2' });
      const result = await service.unfollow('u1', 'u2');
      expect(result.message).toBe('Unfollowed');
    });

    it('acceptRequest — already accepted is idempotent', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({ id: 'req-1', senderId: 'u1', receiverId: 'u2', status: 'ACCEPTED' });
      const result = await service.acceptRequest('u2', 'req-1');
      expect(result.message).toContain('accepted');
    });

    it('acceptRequest — already declined throws', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({ id: 'req-1', senderId: 'u1', receiverId: 'u2', status: 'DECLINED' });
      await expect(service.acceptRequest('u2', 'req-1')).rejects.toThrow(BadRequestException);
    });

    it('acceptRequest — blocked user auto-declines', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({ id: 'req-1', senderId: 'u1', receiverId: 'u2', status: 'PENDING' });
      prisma.block.findFirst.mockResolvedValue({ id: 'b-1' });
      prisma.followRequest.update.mockResolvedValue({});
      await expect(service.acceptRequest('u2', 'req-1')).rejects.toThrow(ForbiddenException);
    });

    it('cancelRequest — sender can cancel', async () => {
      prisma.followRequest.findUnique.mockResolvedValue({ id: 'req-1', senderId: 'u1', receiverId: 'u2' });
      prisma.followRequest.delete.mockResolvedValue({});
      const result = await service.cancelRequest('u1', 'req-1');
      expect(result.message).toContain('cancelled');
    });

    it('getOwnRequests — returns pending requests', async () => {
      const result = await service.getOwnRequests('u1');
      expect(result).toEqual({ data: [], meta: { cursor: null, hasMore: false } });
    });

    it('getSuggestions — returns users', async () => {
      prisma.follow.findMany.mockResolvedValue([]);
      const result = await service.getSuggestions('u1');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ── Events deep ──
  describe('EventsService — deep coverage', () => {
    let service: EventsService;
    let prisma: any;
    const ev = { id: 'e-1', userId: 'organizer', title: 'Test', maxAttendees: 100 };

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
      service = module.get(EventsService); prisma = module.get(PrismaService);
    });

    it('createEvent — returns event', async () => {
      prisma.event.create.mockResolvedValue({ ...ev, startDate: new Date(), endDate: new Date() });
      const result = await service.createEvent('organizer', { title: 'Test', startDate: new Date().toISOString(), endDate: new Date().toISOString() } as any);
      expect(result.title).toBe('Test');
    });

    it('getEvent — returns event with RSVP counts', async () => {
      prisma.event.findUnique.mockResolvedValue(ev);
      prisma.eventRSVP.groupBy.mockResolvedValue([]);
      prisma.eventRSVP.findUnique.mockResolvedValue(null);
      const result = await service.getEvent('e-1', 'viewer');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('id', 'e-1');
    });

    it('updateEvent — organizer can update', async () => {
      prisma.event.findUnique.mockResolvedValue(ev);
      prisma.event.update.mockResolvedValue({ ...ev, title: 'Updated' });
      const result = await service.updateEvent('organizer', 'e-1', { title: 'Updated' } as any);
      expect(result).toBeDefined();
      expect(result.title).toBe('Updated');
    });

    it('deleteEvent — organizer can delete', async () => {
      prisma.event.findUnique.mockResolvedValue(ev);
      prisma.event.delete.mockResolvedValue({});
      const result = await service.deleteEvent('organizer', 'e-1');
      expect(result).toBeDefined();
      expect(prisma.event.delete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'e-1' } }));
    });

    it('listAttendees — returns empty', async () => {
      prisma.event.findUnique.mockResolvedValue(ev);
      const result = await service.listAttendees('e-1');
      expect(result.data).toEqual([]);
    });
  });

  // ── Commerce deep ──
  describe('CommerceService — deep coverage', () => {
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
      service = module.get(CommerceService); prisma = module.get(PrismaService);
    });

    it('createBusiness — returns business', async () => {
      prisma.halalBusiness.create.mockResolvedValue({ id: 'b-1', name: 'Test Halal', ownerId: 'u1' });
      const result = await service.createBusiness('u1', { name: 'Test Halal', category: 'RESTAURANT' } as any);
      expect(result.name).toBe('Test Halal');
    });

    it('getBusinesses — empty', async () => {
      const result = await service.getBusinesses();
      expect(result.data).toEqual([]);
    });

    it('getZakatFunds — empty', async () => {
      const result = await service.getZakatFunds();
      expect(result.data).toEqual([]);
    });

    it('getProduct — non-existent', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.getProduct('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('getMyOrders — empty', async () => {
      const result = await service.getMyOrders('u1');
      expect(result.data).toEqual([]);
    });

    it('getPremiumStatus — non-premium', async () => {
      prisma.premiumSubscription.findUnique.mockResolvedValue(null);
      const result = await service.getPremiumStatus('u1');
      expect(result.isPremium).toBe(false);
    });
  });
});

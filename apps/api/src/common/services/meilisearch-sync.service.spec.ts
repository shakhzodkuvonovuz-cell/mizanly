import { Test, TestingModule } from '@nestjs/testing';
import { MeilisearchSyncService } from './meilisearch-sync.service';
import { PrismaService } from '../../config/prisma.service';
import { MeilisearchService } from '../../modules/search/meilisearch.service';

describe('MeilisearchSyncService', () => {
  let service: MeilisearchSyncService;
  let prisma: any;
  let meilisearch: any;

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      post: { findMany: jest.fn().mockResolvedValue([]) },
      thread: { findMany: jest.fn().mockResolvedValue([]) },
      reel: { findMany: jest.fn().mockResolvedValue([]) },
      video: { findMany: jest.fn().mockResolvedValue([]) },
      hashtag: { findMany: jest.fn().mockResolvedValue([]) },
    };

    meilisearch = {
      isAvailable: jest.fn().mockReturnValue(true),
      addDocuments: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeilisearchSyncService,
        { provide: PrismaService, useValue: prisma },
        { provide: MeilisearchService, useValue: meilisearch },
      ],
    }).compile();

    service = module.get(MeilisearchSyncService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── syncAll ──

  describe('syncAll', () => {
    it('should return error:-1 when Meilisearch is unavailable', async () => {
      meilisearch.isAvailable.mockReturnValue(false);
      const result = await service.syncAll();
      expect(result).toEqual({ error: -1 });
    });

    it('should sync all 6 content types and return counts', async () => {
      const result = await service.syncAll();
      expect(result).toEqual({
        users: 0,
        posts: 0,
        threads: 0,
        reels: 0,
        videos: 0,
        hashtags: 0,
      });
    });

    it('should process a batch of users', async () => {
      const users = [
        { id: 'u1', username: 'alice', displayName: 'Alice', bio: 'Hi', avatarUrl: null, isVerified: false, followersCount: 10 },
        { id: 'u2', username: 'bob', displayName: 'Bob', bio: null, avatarUrl: null, isVerified: true, followersCount: 50 },
      ];
      prisma.user.findMany.mockResolvedValueOnce(users); // first batch (< 501, so done)

      const result = await service.syncAll();
      expect(result.users).toBe(2);
      expect(meilisearch.addDocuments).toHaveBeenCalledWith('users', expect.arrayContaining([
        expect.objectContaining({ id: 'u1', username: 'alice', type: 'user' }),
      ]));
    });

    it('should handle multiple batches with cursor pagination', async () => {
      // Create 501 items to trigger pagination (BATCH=500)
      const batch1 = Array.from({ length: 501 }, (_, i) => ({
        id: `u${i}`,
        username: `user${i}`,
        displayName: `User ${i}`,
        bio: null,
        avatarUrl: null,
        isVerified: false,
        followersCount: 0,
      }));
      const batch2: any[] = [];

      prisma.user.findMany
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce(batch2);

      const result = await service.syncAll();
      expect(result.users).toBe(500); // First batch of 500
      expect(prisma.user.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ── Individual sync methods (tested via syncAll but verifying mapping) ──

  describe('syncPosts', () => {
    it('should map posts to search documents', async () => {
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'p1', content: 'Hello world', hashtags: ['test'], userId: 'u1',
          postType: 'TEXT', likesCount: 5, createdAt: new Date('2026-01-01'),
          user: { username: 'alice' },
        },
      ]);

      const result = await service.syncAll();
      expect(result.posts).toBe(1);
      expect(meilisearch.addDocuments).toHaveBeenCalledWith('posts', [
        expect.objectContaining({
          id: 'p1',
          type: 'post',
          content: 'Hello world',
          hashtags: ['test'],
          username: 'alice',
          visibility: 'PUBLIC',
          isRemoved: false,
        }),
      ]);
    });
  });

  describe('syncThreads', () => {
    it('should map threads to search documents', async () => {
      prisma.thread.findMany.mockResolvedValue([
        {
          id: 't1', content: 'Thread content', hashtags: [], userId: 'u1',
          likesCount: 3, createdAt: new Date('2026-01-01'),
          user: { username: 'bob' },
        },
      ]);

      const result = await service.syncAll();
      expect(result.threads).toBe(1);
      expect(meilisearch.addDocuments).toHaveBeenCalledWith('threads', [
        expect.objectContaining({ id: 't1', type: 'thread', isChainHead: true }),
      ]);
    });
  });

  describe('syncReels', () => {
    it('should map reels with caption to content field', async () => {
      prisma.reel.findMany.mockResolvedValue([
        {
          id: 'r1', caption: 'My reel', hashtags: ['fun'], userId: 'u1',
          likesCount: 10, viewsCount: 100, createdAt: new Date('2026-01-01'),
          user: { username: 'carol' },
        },
      ]);

      const result = await service.syncAll();
      expect(result.reels).toBe(1);
      expect(meilisearch.addDocuments).toHaveBeenCalledWith('reels', [
        expect.objectContaining({ id: 'r1', type: 'reel', status: 'READY' }),
      ]);
    });
  });

  describe('syncVideos', () => {
    it('should map videos to search documents', async () => {
      prisma.video.findMany.mockResolvedValue([
        {
          id: 'v1', title: 'Video', description: 'Desc', tags: ['tag1'], userId: 'u1',
          channelId: 'ch1', viewsCount: 500, likesCount: 50, createdAt: new Date('2026-01-01'),
          category: 'EDUCATION', user: { username: 'dave' },
        },
      ]);

      const result = await service.syncAll();
      expect(result.videos).toBe(1);
      expect(meilisearch.addDocuments).toHaveBeenCalledWith('videos', [
        expect.objectContaining({ id: 'v1', type: 'video', status: 'PUBLISHED' }),
      ]);
    });
  });

  describe('syncHashtags', () => {
    it('should map hashtags to search documents', async () => {
      prisma.hashtag.findMany.mockResolvedValue([
        { id: 'h1', name: 'ramadan', postsCount: 42, createdAt: new Date('2026-01-01') },
      ]);

      const result = await service.syncAll();
      expect(result.hashtags).toBe(1);
      expect(meilisearch.addDocuments).toHaveBeenCalledWith('hashtags', [
        expect.objectContaining({ id: 'h1', type: 'hashtag', name: 'ramadan' }),
      ]);
    });
  });
});

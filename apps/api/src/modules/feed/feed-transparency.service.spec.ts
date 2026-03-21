import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { FeedTransparencyService } from './feed-transparency.service';

describe('FeedTransparencyService', () => {
  let service: FeedTransparencyService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedTransparencyService,
        {
          provide: PrismaService,
          useValue: {
            post: { findUnique: jest.fn(), findMany: jest.fn() },
            follow: { findUnique: jest.fn() },
            feedInteraction: { findMany: jest.fn() },
            hashtag: { findMany: jest.fn() },
            userInterest: { findMany: jest.fn().mockResolvedValue([]) },
            thread: { findUnique: jest.fn() },
            block: { findMany: jest.fn().mockResolvedValue([]) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();

    service = module.get<FeedTransparencyService>(FeedTransparencyService);
    prisma = module.get(PrismaService) as any;
  });

  describe('explainPost', () => {
    it('should return follow reason when user follows author', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 5, commentsCount: 2, sharesCount: 0, viewsCount: 10, content: 'Hello', hashtags: [], createdAt: new Date(),
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue({ id: 'f1' });

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons).toContain('Posted by @author, who you follow');
    });

    it('should return popularity reason for high likes', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 150, commentsCount: 50, sharesCount: 0, viewsCount: 500, content: 'Popular', hashtags: [], createdAt: new Date(),
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons.some(r => r.includes('150 likes'))).toBe(true);
    });

    it('should return engagement reason for moderate likes', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 25, commentsCount: 3, sharesCount: 0, viewsCount: 100, content: 'Nice', hashtags: [], createdAt: new Date(),
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons.some(r => r.includes('Engaging'))).toBe(true);
    });

    it('should return not found for missing post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      const result = await service.explainPost('user-1', 'missing');
      expect(result.reasons).toContain('Post not found');
    });

    it('should handle post with hashtags', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 0, commentsCount: 0, sharesCount: 0, viewsCount: 0, content: '#islam #prayer', hashtags: ['islam', 'prayer'], createdAt: new Date(),
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons).toBeDefined();
    });

    it('should handle post with null content', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 0, commentsCount: 0, sharesCount: 0, viewsCount: 0, content: null, hashtags: [], createdAt: new Date(),
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons).toBeDefined();
    });

    it('should include multiple reasons when applicable', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 200, commentsCount: 50, sharesCount: 0, viewsCount: 1000, content: '#trending', hashtags: ['trending'], createdAt: new Date(),
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue({ id: 'f1' });

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    });

    it('should not include follow reason when user does not follow', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 5, commentsCount: 0, sharesCount: 0, viewsCount: 10, content: 'test', hashtags: [], createdAt: new Date(),
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons.some(r => r.includes('you follow'))).toBe(false);
    });

    it('should handle low engagement post with no reasons', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 0, commentsCount: 0, sharesCount: 0, viewsCount: 0, content: 'boring', hashtags: [], createdAt: new Date(Date.now() - 48 * 3600000),
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons).toBeDefined();
    });

    it('should format username correctly in follow reason', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 0, commentsCount: 0, sharesCount: 0, viewsCount: 0, content: '', hashtags: [], createdAt: new Date(),
        user: { username: 'test_user' },
      });
      prisma.follow.findUnique.mockResolvedValue({ id: 'f1' });

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons.some(r => r.includes('@test_user'))).toBe(true);
    });

    it('should include interests reason when user has interests', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 0, commentsCount: 0, sharesCount: 0, viewsCount: 0, content: 'test post', hashtags: [], createdAt: new Date(),
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);
      prisma.userInterest.findMany.mockResolvedValue([{ category: 'islamic' }]);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons.some(r => r.includes('Matches your interests'))).toBe(true);
    });

    it('should cap reasons at 3', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 200, commentsCount: 50, sharesCount: 10, viewsCount: 2000, content: '#trending #viral', hashtags: ['trending', 'viral'], createdAt: new Date(),
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue({ id: 'f1' });
      prisma.userInterest.findMany.mockResolvedValue([{ category: 'tech' }]);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons.length).toBeLessThanOrEqual(3);
    });

    it('should return "Recommended for you" when no other reasons', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 0, commentsCount: 0, sharesCount: 0, viewsCount: 0, content: null, hashtags: [], createdAt: new Date(Date.now() - 48 * 3600000),
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);
      prisma.userInterest.findMany.mockResolvedValue([]);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons).toContain('Recommended for you');
    });
  });

  describe('explainThread', () => {
    it('should return follow reason for thread author', async () => {
      prisma.thread.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 5, content: 'A thread',
        user: { username: 'threaduser' },
      });
      prisma.follow.findUnique.mockResolvedValue({ id: 'f1' });

      const result = await service.explainThread('user-1', 'thread-1');
      expect(result.reasons.some(r => r.includes('@threaduser'))).toBe(true);
    });

    it('should return trending reason for popular thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 100, content: 'Hot take',
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainThread('user-1', 'thread-1');
      expect(result.reasons.some(r => r.includes('Trending thread'))).toBe(true);
    });

    it('should return "Thread not found" for missing thread', async () => {
      prisma.thread.findUnique.mockResolvedValue(null);
      const result = await service.explainThread('user-1', 'missing');
      expect(result.reasons).toContain('Thread not found');
    });

    it('should return "Recommended for you" for low-engagement unfollowed thread', async () => {
      prisma.thread.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 2, content: 'quiet',
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainThread('user-1', 'thread-1');
      expect(result.reasons).toContain('Recommended for you');
    });

    it('should include hashtag reason', async () => {
      prisma.thread.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 0, content: '#islam #quran discussion',
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainThread('user-1', 'thread-1');
      expect(result.reasons.some(r => r.includes('Tagged with'))).toBe(true);
    });
  });

  describe('enhancedSearch', () => {
    it('should return empty for short query words', async () => {
      const result = await service.enhancedSearch('a b');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return search results', async () => {
      prisma.post.findMany.mockResolvedValue([
        { id: 'p1', content: 'Islamic fiqh discussion', likesCount: 50, createdAt: new Date(), user: { id: 'u1', username: 'author', displayName: 'Author', avatarUrl: null } },
      ]);
      const result = await service.enhancedSearch('islamic fiqh');
      expect(result.data).toHaveLength(1);
    });

    it('should set hasMore when results exceed limit', async () => {
      const posts = Array.from({ length: 21 }, (_, i) => ({
        id: `p${i}`, content: `Post about quran ${i}`, likesCount: 100 - i, createdAt: new Date(),
        user: { id: 'u1', username: 'author', displayName: 'Author', avatarUrl: null },
      }));
      prisma.post.findMany.mockResolvedValue(posts);
      const result = await service.enhancedSearch('quran');
      expect(result.meta.hasMore).toBe(true);
      expect(result.data).toHaveLength(20);
    });

    it('should exclude blocked/muted users when authenticated', async () => {
      prisma.block.findMany.mockResolvedValue([{ blockerId: 'user-1', blockedId: 'bad-user' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted-user' }]);
      prisma.post.findMany.mockResolvedValue([]);
      const result = await service.enhancedSearch('test query', undefined, 20, 'user-1');
      expect(result.data).toEqual([]);
      expect(prisma.block.findMany).toHaveBeenCalled();
      expect(prisma.mute.findMany).toHaveBeenCalled();
    });
  });
});

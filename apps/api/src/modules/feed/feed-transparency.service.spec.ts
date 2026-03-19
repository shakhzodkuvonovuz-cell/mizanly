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
        userId: 'author-1', likesCount: 5, commentsCount: 2, content: 'Hello',
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue({ id: 'f1' });

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons).toContain('Posted by @author, who you follow');
    });

    it('should return popularity reason for high likes', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 150, commentsCount: 50, content: 'Popular',
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons.some(r => r.includes('150 likes'))).toBe(true);
    });

    it('should return engagement reason for moderate likes', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 25, commentsCount: 3, content: 'Nice',
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
        userId: 'author-1', likesCount: 0, commentsCount: 0, content: '#islam #prayer',
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons).toBeDefined();
    });

    it('should handle post with null content', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 0, commentsCount: 0, content: null,
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons).toBeDefined();
    });

    it('should include multiple reasons when applicable', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 200, commentsCount: 50, content: '#trending',
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue({ id: 'f1' });

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    });

    it('should not include follow reason when user does not follow', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 5, commentsCount: 0, content: 'test',
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons.some(r => r.includes('you follow'))).toBe(false);
    });

    it('should handle low engagement post with no reasons', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 0, commentsCount: 0, content: 'boring',
        user: { username: 'author' },
      });
      prisma.follow.findUnique.mockResolvedValue(null);

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons).toBeDefined();
    });

    it('should format username correctly in follow reason', async () => {
      prisma.post.findUnique.mockResolvedValue({
        userId: 'author-1', likesCount: 0, commentsCount: 0, content: '',
        user: { username: 'test_user' },
      });
      prisma.follow.findUnique.mockResolvedValue({ id: 'f1' });

      const result = await service.explainPost('user-1', 'post-1');
      expect(result.reasons.some(r => r.includes('@test_user'))).toBe(true);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { AiService } from './ai.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('AiService', () => {
  let service: AiService;
  let prisma: any;

  beforeEach(async () => {
    // Ensure no API key for deterministic fallback behavior
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        AiService,
        {
          provide: PrismaService,
          useValue: {
            post: { findMany: jest.fn(), count: jest.fn() },
            aiTranslation: { findUnique: jest.fn(), upsert: jest.fn() },
            aiCaption: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
            aiAvatar: { create: jest.fn(), findMany: jest.fn() },
            userXP: { findUnique: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    prisma = module.get(PrismaService) as any;
  });

  describe('suggestCaptions', () => {
    it('should return fallback captions when API unavailable', async () => {
      const result = await service.suggestCaptions('test content');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('caption');
      expect(result[0]).toHaveProperty('tone');
    });
  });

  describe('suggestHashtags', () => {
    it('should return fallback hashtags when API unavailable', async () => {
      const result = await service.suggestHashtags('test post about cooking');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('suggestPostingTime', () => {
    it('should return default time for users with few posts', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      const result = await service.suggestPostingTime('user-1');
      expect(result.bestTime).toBe('18:00');
      expect(result.reason).toBeTruthy();
    });

    it('should return best hour based on engagement data', async () => {
      const posts = Array(5).fill(null).map((_, i) => ({
        createdAt: new Date(2026, 2, 18, 14 + (i % 3), 0),
        likesCount: 10 + i * 5,
        commentsCount: 2 + i,
      }));
      prisma.post.findMany.mockResolvedValue(posts);
      const result = await service.suggestPostingTime('user-1');
      expect(result.bestTime).toMatch(/^\d{2}:00$/);
    });
  });

  describe('translateText', () => {
    it('should return cached translation when available', async () => {
      prisma.aiTranslation.findUnique.mockResolvedValue({
        translatedText: 'مرحبا',
      });

      const result = await service.translateText('Hello', 'ar', 'content-1', 'post');
      expect(result).toBe('مرحبا');
      expect(prisma.aiTranslation.findUnique).toHaveBeenCalled();
    });

    it('should return fallback when no cache and no API', async () => {
      prisma.aiTranslation.findUnique.mockResolvedValue(null);
      prisma.aiTranslation.upsert.mockResolvedValue({});

      const result = await service.translateText('Hello', 'ar', 'content-1', 'post');
      expect(typeof result).toBe('string');
    });
  });

  describe('moderateContent', () => {
    it('should return safe result as fallback', async () => {
      const result = await service.moderateContent('This is a nice post', 'post');
      expect(result.safe).toBe(true);
      expect(result.confidence).toBeDefined();
    });
  });

  describe('suggestSmartReplies', () => {
    it('should return fallback replies', async () => {
      const result = await service.suggestSmartReplies('greeting', ['Assalamu Alaikum!']);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('text');
      expect(result[0]).toHaveProperty('tone');
    });
  });

  describe('summarizeContent', () => {
    it('should return text as-is when under max length', async () => {
      const shortText = 'Short text';
      const result = await service.summarizeContent(shortText, 150);
      expect(result).toBe(shortText);
    });
  });

  describe('routeToSpace', () => {
    it('should recommend MINBAR for long videos', async () => {
      const result = await service.routeToSpace('My documentary', ['long_video']);
      expect(result.recommendedSpace).toBe('MINBAR');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should recommend BAKRA for short videos', async () => {
      const result = await service.routeToSpace('Check this out', ['video']);
      expect(result.recommendedSpace).toBe('BAKRA');
    });

    it('should recommend SAF for images', async () => {
      const result = await service.routeToSpace('Beautiful sunset', ['image/jpeg']);
      expect(result.recommendedSpace).toBe('SAF');
    });

    it('should recommend MAJLIS for short text without media', async () => {
      const result = await service.routeToSpace('What do you think about this?', []);
      expect(result.recommendedSpace).toBe('MAJLIS');
    });
  });

  describe('generateAvatar', () => {
    it('should create an avatar record', async () => {
      prisma.aiAvatar.create.mockResolvedValue({
        id: 'avatar-1',
        userId: 'user-1',
        sourceUrl: 'https://r2.test/photo.jpg',
        avatarUrl: 'https://r2.test/photo.jpg',
        style: 'anime',
      });

      const result = await service.generateAvatar('user-1', 'https://r2.test/photo.jpg', 'anime');
      expect(result.avatarUrl).toBeTruthy();
    });
  });

  describe('getUserAvatars', () => {
    it('should return user avatars sorted by recent', async () => {
      prisma.aiAvatar.findMany.mockResolvedValue([
        { id: 'a1', style: 'anime' },
        { id: 'a2', style: 'watercolor' },
      ]);

      const result = await service.getUserAvatars('user-1');
      expect(result).toHaveLength(2);
    });
  });
});

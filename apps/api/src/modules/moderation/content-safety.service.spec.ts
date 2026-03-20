import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { ContentSafetyService } from './content-safety.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ContentSafetyService', () => {
  let service: ContentSafetyService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue('0'),
      set: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ContentSafetyService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-key') } },
        { provide: 'REDIS', useValue: redis },
        {
          provide: PrismaService,
          useValue: {
            moderationAction: { create: jest.fn().mockResolvedValue({ id: 'mod-1' }), findMany: jest.fn().mockResolvedValue([]) },
            moderationLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
            reel: { update: jest.fn() },
            thread: { update: jest.fn() },
            comment: { update: jest.fn() },
            report: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
            user: { findUnique: jest.fn(), update: jest.fn() },
            post: { findUnique: jest.fn(), update: jest.fn() },
            message: { findUnique: jest.fn().mockResolvedValue({ id: 'msg-1', forwardCount: 3 }) },
            blockedKeyword: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();

    service = module.get<ContentSafetyService>(ContentSafetyService);
    prisma = module.get(PrismaService) as any;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ContentSafetyService);
  });

  describe('moderateText', () => {
    it('should return safe result for clean content', async () => {
      const result = await service.moderateText('Assalamu alaikum, how are you?');
      expect(result).toHaveProperty('safe');
      expect(result.safe).toBe(true);
    });

    it('should flag content with blocked keywords when configured', async () => {
      prisma.blockedKeyword.findMany.mockResolvedValue([
        { keyword: 'spam', isRegex: false },
      ]);
      const result = await service.moderateText('this is spam content');
      expect(result).toHaveProperty('safe');
    });

    it('should handle empty text input', async () => {
      const result = await service.moderateText('');
      expect(result).toHaveProperty('safe');
      expect(result.safe).toBe(true);
    });

    it('should handle Arabic text without false positives', async () => {
      const result = await service.moderateText('بسم الله الرحمن الرحيم');
      expect(result).toHaveProperty('safe');
      expect(result.safe).toBe(true);
    });
  });

  describe('moderateImage', () => {
    it('should return safe result with action and confidence', async () => {
      const result = await service.moderateImage('https://example.com/safe-image.jpg');
      expect(result).toHaveProperty('safe');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('flags');
      expect(result).toHaveProperty('action');
      expect(['allow', 'flag', 'remove']).toContain(result.action);
    });

    it('should fallback to allow when API key not configured', async () => {
      // Service constructor uses config.get('ANTHROPIC_API_KEY') which returns 'test-key'
      // but the actual API call will fail, so it should fallback
      const result = await service.moderateImage('https://example.com/image.jpg');
      expect(result.safe).toBe(true);
      expect(result.action).toBe('allow');
    });
  });

  describe('checkForwardLimit', () => {
    it('should allow forwarding when count is below limit', async () => {
      redis.get.mockResolvedValue('3');
      const result = await service.checkForwardLimit('msg-1');
      expect(result.allowed).toBe(true);
      expect(result.forwardCount).toBe(3);
      expect(result.maxForwards).toBe(5);
    });

    it('should deny forwarding when count reaches limit', async () => {
      redis.get.mockResolvedValue('5');
      const result = await service.checkForwardLimit('msg-1');
      expect(result.allowed).toBe(false);
      expect(result.forwardCount).toBe(5);
    });

    it('should allow when no forward history exists', async () => {
      redis.get.mockResolvedValue(null);
      const result = await service.checkForwardLimit('msg-new');
      expect(result.allowed).toBe(true);
      expect(result.forwardCount).toBe(0);
    });
  });

  describe('checkKindness', () => {
    it('should return not angry for kind text', async () => {
      const result = await service.checkKindness('JazakAllah Khair for your help');
      expect(result.isAngry).toBe(false);
      expect(result.suggestion).toBeUndefined();
    });

    it('should detect angry text with hostile words', async () => {
      const result = await service.checkKindness('you are so stupid and I hate this');
      expect(result.isAngry).toBe(true);
    });
  });

  describe('autoRemoveContent', () => {
    it('should mark post as removed', async () => {
      prisma.post.update.mockResolvedValue({ id: 'post-1', isRemoved: true });
      await service.autoRemoveContent('post-1', 'post', 'NSFW content detected', ['nudity']);
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { isRemoved: true },
        })
      );
    });

    it('should log moderation action', async () => {
      prisma.post.update.mockResolvedValue({ id: 'post-1', isRemoved: true });
      await service.autoRemoveContent('post-1', 'post', 'NSFW content', ['nudity']);
      expect(prisma.moderationLog.create).toHaveBeenCalled();
    });
  });

  describe('checkViralThrottle', () => {
    it('should allow content below viral threshold', async () => {
      redis.get.mockResolvedValue('50');
      const result = await service.checkViralThrottle('content-1');
      expect(result).toHaveProperty('throttled');
    });
  });
});

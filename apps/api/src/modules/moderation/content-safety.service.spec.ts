import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { ContentSafetyService } from './content-safety.service';

// Mock DNS for SSRF validation to resolve hostnames deterministically
jest.mock('dns', () => {
  const original = jest.requireActual('dns');
  return {
    ...original,
    promises: {
      ...original.promises,
      lookup: jest.fn().mockImplementation((hostname: string) => {
        if (hostname === 'localhost') return Promise.resolve({ address: '127.0.0.1', family: 4 });
        return Promise.resolve({ address: '93.184.216.34', family: 4 });
      }),
    },
  };
});

describe('ContentSafetyService', () => {
  let service: ContentSafetyService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue('0'),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentSafetyService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-api-key') } },
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
            $transaction: jest.fn().mockImplementation((fn: (tx: any) => Promise<void>) => fn({
              post: { update: jest.fn() },
              reel: { update: jest.fn() },
              thread: { update: jest.fn() },
              comment: { update: jest.fn() },
              moderationLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
            })),
          },
        },
      ],
    }).compile();

    service = module.get<ContentSafetyService>(ContentSafetyService);
    prisma = module.get(PrismaService) as any;
  });

  // ── moderateText ────────────────────────────────────────────

  describe('moderateText', () => {
    it('should return safe:true with empty flags for empty text', async () => {
      const result = await service.moderateText('');
      expect(result.safe).toBe(true);
      expect(result.flags).toEqual([]);
    });

    it('should fail-closed when API call fails (returns safe:false)', async () => {
      // The API key is set to a test value, but fetch will fail in tests
      // since no real API is available. This tests the fail-closed behavior.
      const result = await service.moderateText('Assalamu alaikum, how are you?');
      expect(result.safe).toBe(false);
      expect(result.flags).toEqual(expect.arrayContaining([expect.any(String)]));
    });

    it('should include flags array in the result', async () => {
      const result = await service.moderateText('some content');
      expect(Array.isArray(result.flags)).toBe(true);
    });

    it('should handle Arabic text (fail-closed when API unavailable)', async () => {
      const result = await service.moderateText('بسم الله الرحمن الرحيم');
      expect(result.safe).toBe(false);
      // Flags indicate why moderation failed, not content safety per se
      expect(result.flags.length).toBeGreaterThan(0);
    });

    it('should return safe:false with moderation_unavailable flag when no API key', async () => {
      // Rebuild service with no API key
      const module = await Test.createTestingModule({
        providers: [
          ContentSafetyService,
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
          { provide: 'REDIS', useValue: redis },
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();
      const noKeyService = module.get<ContentSafetyService>(ContentSafetyService);

      const result = await noKeyService.moderateText('hello world');
      expect(result.safe).toBe(false);
      expect(result.flags).toContain('moderation_unavailable');
    });
  });

  // ── moderateImage ───────────────────────────────────────────

  describe('moderateImage', () => {
    it('should return result with all required fields (safe, confidence, flags, action)', async () => {
      const result = await service.moderateImage('https://media.mizanly.app/safe-image.jpg');
      expect(typeof result.safe).toBe('boolean');
      expect(typeof result.confidence).toBe('number');
      expect(Array.isArray(result.flags)).toBe(true);
      expect(['allow', 'flag', 'remove']).toContain(result.action);
    });

    it('should fail-closed when API call fails', async () => {
      const result = await service.moderateImage('https://media.mizanly.app/image.jpg');
      expect(result.safe).toBe(false);
      expect(result.action).toBe('flag');
    });

    it('should reject non-HTTPS URLs with invalid_url flag', async () => {
      const result = await service.moderateImage('http://example.com/image.jpg');
      expect(result.safe).toBe(false);
      expect(result.flags).toContain('invalid_url');
      expect(result.action).toBe('flag');
    });

    it('should reject localhost URLs (SSRF prevention)', async () => {
      const result = await service.moderateImage('https://localhost/image.jpg');
      expect(result.safe).toBe(false);
      expect(result.flags).toContain('invalid_url');
    });

    it('should reject private IP ranges (SSRF prevention)', async () => {
      const result = await service.moderateImage('https://192.168.1.1/image.jpg');
      expect(result.safe).toBe(false);
      expect(result.flags).toContain('invalid_url');
    });

    it('should reject 127.0.0.1 (SSRF prevention)', async () => {
      const result = await service.moderateImage('https://127.0.0.1/image.jpg');
      expect(result.safe).toBe(false);
      expect(result.flags).toContain('invalid_url');
    });

    it('should reject malformed URLs', async () => {
      const result = await service.moderateImage('not-a-url');
      expect(result.safe).toBe(false);
      expect(result.flags).toContain('invalid_url');
    });

    it('should return moderation_unavailable when API key is missing', async () => {
      const module = await Test.createTestingModule({
        providers: [
          ContentSafetyService,
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
          { provide: 'REDIS', useValue: redis },
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();
      const noKeyService = module.get<ContentSafetyService>(ContentSafetyService);

      const result = await noKeyService.moderateImage('https://media.mizanly.app/img.jpg');
      expect(result.safe).toBe(false);
      expect(result.flags).toContain('moderation_unavailable');
    });
  });

  // ── checkForwardLimit ───────────────────────────────────────

  describe('checkForwardLimit', () => {
    it('should allow forwarding when count is below limit of 5', async () => {
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

    it('should deny forwarding when count exceeds limit', async () => {
      redis.get.mockResolvedValue('10');
      const result = await service.checkForwardLimit('msg-1');
      expect(result.allowed).toBe(false);
      expect(result.forwardCount).toBe(10);
    });

    it('should allow when no forward history exists (null from Redis)', async () => {
      redis.get.mockResolvedValue(null);
      const result = await service.checkForwardLimit('msg-new');
      expect(result.allowed).toBe(true);
      expect(result.forwardCount).toBe(0);
    });

    it('should use correct Redis key pattern', async () => {
      redis.get.mockResolvedValue('0');
      await service.checkForwardLimit('msg-42');
      expect(redis.get).toHaveBeenCalledWith('forward_count:msg-42');
    });
  });

  // ── incrementForwardCount ───────────────────────────────────

  describe('incrementForwardCount', () => {
    it('should increment the forward count in Redis', async () => {
      await service.incrementForwardCount('msg-1');
      expect(redis.incr).toHaveBeenCalledWith('forward_count:msg-1');
    });

    it('should set TTL of 30 days on the forward count key', async () => {
      await service.incrementForwardCount('msg-1');
      expect(redis.expire).toHaveBeenCalledWith('forward_count:msg-1', 86400 * 30);
    });
  });

  // ── checkKindness ───────────────────────────────────────────

  describe('checkKindness', () => {
    it('should return isAngry:false for kind text without hostile words', async () => {
      const result = await service.checkKindness('JazakAllah Khair for your help');
      expect(result.isAngry).toBe(false);
      expect(result.suggestion).toBeUndefined();
    });

    it('should detect angry text containing hostile words', async () => {
      const result = await service.checkKindness('you are so stupid and I hate this');
      expect(result.isAngry).toBe(true);
    });

    it('should provide a suggestion when text is angry', async () => {
      const result = await service.checkKindness('you are an idiot');
      expect(result.isAngry).toBe(true);
      expect(result.suggestion).toBeDefined();
      expect(typeof result.suggestion).toBe('string');
    });

    it('should detect excessive exclamation marks as angry', async () => {
      const result = await service.checkKindness('This is so wrong!!!! I cant believe it!!!!');
      expect(result.isAngry).toBe(true);
    });

    it('should not flag short text even with exclamation marks', async () => {
      // Text length <= 10 chars bypasses the excessive exclamation check
      const result = await service.checkKindness('wow!!!!!!');
      expect(result.isAngry).toBe(false);
    });
  });

  // ── autoRemoveContent ───────────────────────────────────────

  describe('autoRemoveContent', () => {
    const makeTx = (overrides: Record<string, any> = {}) => ({
      post: { update: jest.fn().mockResolvedValue({ userId: 'owner-1' }) },
      reel: { update: jest.fn().mockResolvedValue({ userId: 'owner-1' }) },
      thread: { update: jest.fn().mockResolvedValue({ userId: 'owner-1' }) },
      comment: { update: jest.fn().mockResolvedValue({ userId: 'owner-1' }) },
      moderationLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) },
      ...overrides,
    });

    it('should mark post as removed via transaction', async () => {
      const txPost = { update: jest.fn().mockResolvedValue({ userId: 'owner-1' }) };
      const tx = makeTx({ post: txPost });
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<void>) => fn(tx));

      await service.autoRemoveContent('post-1', 'post', 'NSFW content detected', ['nudity']);

      expect(txPost.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { isRemoved: true },
        select: { userId: true },
      });
    });

    it('should mark reel as removed via transaction', async () => {
      const txReel = { update: jest.fn().mockResolvedValue({ userId: 'owner-1' }) };
      const tx = makeTx({ reel: txReel });
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<void>) => fn(tx));

      await service.autoRemoveContent('reel-1', 'reel', 'Violence detected', ['violence']);

      expect(txReel.update).toHaveBeenCalledWith({
        where: { id: 'reel-1' },
        data: { isRemoved: true },
        select: { userId: true },
      });
    });

    it('should mark thread as removed via transaction', async () => {
      const txThread = { update: jest.fn().mockResolvedValue({ userId: 'owner-1' }) };
      const tx = makeTx({ thread: txThread });
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<void>) => fn(tx));

      await service.autoRemoveContent('thread-1', 'thread', 'Hate speech', ['hate']);

      expect(txThread.update).toHaveBeenCalledWith({
        where: { id: 'thread-1' },
        data: { isRemoved: true },
        select: { userId: true },
      });
    });

    it('should mark comment as removed via transaction', async () => {
      const txComment = { update: jest.fn().mockResolvedValue({ userId: 'owner-1' }) };
      const tx = makeTx({ comment: txComment });
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<void>) => fn(tx));

      await service.autoRemoveContent('comment-1', 'comment', 'Harassment', ['harassment']);

      expect(txComment.update).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
        data: { isRemoved: true },
        select: { userId: true },
      });
    });

    it('should create moderation log entry with reason and flags in explanation', async () => {
      const txLog = { create: jest.fn().mockResolvedValue({ id: 'log-1' }) };
      const tx = makeTx({ moderationLog: txLog });
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<void>) => fn(tx));

      await service.autoRemoveContent('post-1', 'post', 'NSFW detected', ['nudity', 'suggestive']);

      expect(txLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            moderatorId: 'system',
            action: 'CONTENT_REMOVED',
            reason: 'NSFW detected',
            explanation: 'Auto-removed: nudity, suggestive',
          }),
        }),
      );
    });
  });

  // ── checkViralThrottle ──────────────────────────────────────

  describe('checkViralThrottle', () => {
    it('should not throttle content with low share count', async () => {
      redis.get.mockResolvedValueOnce('10'); // share count
      redis.get.mockResolvedValueOnce(String(Date.now() - 5 * 60000)); // age: 5 min ago
      const result = await service.checkViralThrottle('content-1');
      expect(result.throttled).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it('should throttle content with >50 shares in <60 minutes', async () => {
      redis.get.mockResolvedValueOnce('75'); // share count: over threshold
      redis.get.mockResolvedValueOnce(String(Date.now() - 10 * 60000)); // age: 10 min ago
      const result = await service.checkViralThrottle('content-1');
      expect(result.throttled).toBe(true);
      expect(result.reason).toBeDefined();
      expect(typeof result.reason).toBe('string');
    });

    it('should not throttle old content even with high shares', async () => {
      redis.get.mockResolvedValueOnce('100'); // share count: over threshold
      redis.get.mockResolvedValueOnce(null); // no age key: defaults to 9999 minutes
      const result = await service.checkViralThrottle('content-1');
      expect(result.throttled).toBe(false);
    });
  });

  // ── trackShare ──────────────────────────────────────────────

  describe('trackShare', () => {
    it('should increment share count with 1-hour TTL', async () => {
      redis.exists.mockResolvedValue(1); // age key already exists
      await service.trackShare('content-1');

      expect(redis.incr).toHaveBeenCalledWith('viral_shares:content-1');
      expect(redis.expire).toHaveBeenCalledWith('viral_shares:content-1', 3600);
    });

    it('should create age tracking key on first share', async () => {
      redis.exists.mockResolvedValue(0); // age key does not exist
      await service.trackShare('content-1');

      expect(redis.setex).toHaveBeenCalledWith(
        'content_age:content-1',
        3600,
        expect.any(String),
      );
    });

    it('should not overwrite age tracking key on subsequent shares', async () => {
      redis.exists.mockResolvedValue(1); // age key already exists
      await service.trackShare('content-1');

      expect(redis.setex).not.toHaveBeenCalled();
    });
  });
});

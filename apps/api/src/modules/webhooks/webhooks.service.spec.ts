import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: any;
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    originalFetch = global.fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        WebhooksService,
        {
          provide: PrismaService,
          useValue: {
            webhook: {
              create: jest.fn().mockResolvedValue({
                id: 'wh-1', name: 'Test Hook', url: 'https://example.com/hook',
                events: ['message.sent'], secret: 'abc123', createdById: 'u1',
              }),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue({ id: 'wh-1', createdById: 'u1' }),
              delete: jest.fn().mockResolvedValue({}),
              update: jest.fn().mockResolvedValue({}),
            },
            circleMember: {
              findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
            },
          },
        },
      ],
    }).compile();

    service = module.get(WebhooksService);
    prisma = module.get(PrismaService) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('create', () => {
    it('should create a webhook', async () => {
      const result = await service.create('u1', {
        circleId: 'c1', name: 'Test Hook',
        url: 'https://example.com/hook', events: ['message.sent'],
      });
      expect(result.name).toBe('Test Hook');
      expect(result.secret).toBeDefined();
    });

    it('should require admin/owner role', async () => {
      prisma.circleMember.findUnique.mockResolvedValueOnce({ role: 'MEMBER' });
      await expect(service.create('u1', {
        circleId: 'c1', name: 'Test', url: 'https://example.com/hook', events: ['post.created'],
      })).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-members', async () => {
      prisma.circleMember.findUnique.mockResolvedValueOnce(null);
      await expect(service.create('u1', {
        circleId: 'c1', name: 'Test', url: 'https://example.com/hook', events: ['post.created'],
      })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('list', () => {
    it('should list webhooks for a circle', async () => {
      const result = await service.list('c1');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should verify membership when userId provided', async () => {
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
      await service.list('c1', 'u1');
      expect(prisma.circleMember.findUnique).toHaveBeenCalled();
    });

    it('should reject non-members when userId provided', async () => {
      prisma.circleMember.findUnique.mockResolvedValueOnce(null);
      await expect(service.list('c1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should delete a webhook', async () => {
      await service.delete('wh-1', 'u1');
      expect(prisma.webhook.delete).toHaveBeenCalledWith({ where: { id: 'wh-1' } });
    });

    it('should throw NotFoundException when deleting non-existent webhook', async () => {
      prisma.webhook.findUnique.mockResolvedValueOnce(null);
      await expect(service.delete('invalid', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user does not own webhook', async () => {
      prisma.webhook.findUnique.mockResolvedValueOnce({ id: 'wh-1', createdById: 'other-user' });
      await expect(service.delete('wh-1', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('test', () => {
    it('should throw NotFoundException when webhook not found', async () => {
      prisma.webhook.findUnique.mockResolvedValue(null);
      await expect(service.test('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when user does not own webhook', async () => {
      prisma.webhook.findUnique.mockResolvedValue({ id: 'wh-1', url: 'https://example.com/hook', secret: 'sec', createdById: 'other-user' });
      await expect(service.test('wh-1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('should deliver test payload', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
      prisma.webhook.findUnique.mockResolvedValue({ id: 'wh-1', url: 'https://example.com/hook', secret: 'sec', createdById: 'u1' });
      const result = await service.test('wh-1', 'u1');
      expect(result.success).toBe(true);
    });

    it('should reject test delivery when secret is missing', async () => {
      prisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1', url: 'https://example.com/hook', secret: null, createdById: 'u1',
      });
      await expect(service.test('wh-1', 'u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('deliver', () => {
    it('should compute HMAC-SHA256 signature and send payload', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
      const result = await service.deliver('https://example.com/webhook', 'secret123', { event: 'test', data: {} });
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('should retry on failure and return success=false after exhausting retries', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any;
      const result = await service.deliver('https://example.com/webhook', 'secret', { event: 'test' });
      expect(result.success).toBe(false);
    });

    it('should include X-Mizanly-Signature and X-Mizanly-Timestamp headers', async () => {
      const mockFetchFn = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = mockFetchFn as any;
      await service.deliver('https://example.com/hook', 'secret', { event: 'test' });
      expect(mockFetchFn).toHaveBeenCalledWith('https://example.com/hook', expect.objectContaining({
        headers: expect.objectContaining({
          'X-Mizanly-Signature': expect.stringContaining('sha256='),
          'X-Mizanly-Timestamp': expect.any(String),
        }),
      }));
    });

    it('should succeed on second attempt after first failure', async () => {
      global.fetch = jest.fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ ok: true, status: 200 }) as any;
      const result = await service.deliver('https://example.com/hook', 'secret', { event: 'test' });
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('should return success=false for non-ok HTTP responses', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
      const result = await service.deliver('https://example.com/hook', 'secret', { event: 'test' });
      expect(result.success).toBe(false);
    });

    it('should return success=false without calling fetch when secret is empty', async () => {
      const mockFetchFn = jest.fn();
      global.fetch = mockFetchFn as any;
      const result = await service.deliver('https://example.com/hook', '', { event: 'test' });
      expect(result.success).toBe(false);
      expect(mockFetchFn).not.toHaveBeenCalled();
    });
  });

  describe('dispatch', () => {
    it('should dispatch to matching webhooks', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
      prisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://example.com/hook1', secret: 'sec1', events: ['post.created'], isActive: true },
        { id: 'wh-2', url: 'https://example.com/hook2', secret: 'sec2', events: ['member.joined'], isActive: true },
      ]);
      const result = await service.dispatch('c1', 'post.created', { postId: 'p1' });
      expect(result.dispatched).toBe(1);
    });

    it('should dispatch 0 when no matching webhooks', async () => {
      prisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://example.com/hook', secret: 'sec', events: ['member.joined'], isActive: true },
      ]);
      const result = await service.dispatch('c1', 'post.created', { postId: 'p1' });
      expect(result.dispatched).toBe(0);
    });

    it('should dispatch 0 when no webhooks exist', async () => {
      prisma.webhook.findMany.mockResolvedValue([]);
      const result = await service.dispatch('c1', 'live.started', {});
      expect(result.dispatched).toBe(0);
    });

    it('should skip webhooks without secrets', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
      prisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://example.com/hook1', secret: null, events: ['post.created'], isActive: true },
        { id: 'wh-2', url: 'https://example.com/hook2', secret: 'sec2', events: ['post.created'], isActive: true },
      ]);
      const result = await service.dispatch('c1', 'post.created', { postId: 'p1' });
      expect(result.dispatched).toBe(1); // Only wh-2 (has secret)
    });

    it('should only update lastUsedAt on successful delivery', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
      prisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://example.com/hook1', secret: 'sec1', events: ['post.created'], isActive: true },
      ]);
      await service.dispatch('c1', 'post.created', { data: {} });
      expect(prisma.webhook.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-1' },
          data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
        }),
      );
    });

    it('should not update lastUsedAt on failed delivery', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('fail')) as any;
      prisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://example.com/hook1', secret: 'sec1', events: ['post.created'], isActive: true },
      ]);
      await service.dispatch('c1', 'post.created', { data: {} });
      expect(prisma.webhook.update).not.toHaveBeenCalled();
    });
  });

  describe('SSRF prevention', () => {
    it('should reject HTTP URLs (non-HTTPS)', async () => {
      await expect(
        service.create('u1', { circleId: 'c1', name: 'Bad Hook', url: 'http://example.com/hook', events: ['post.created'] }),
      ).rejects.toThrow();
    });

    it('should reject localhost URLs', async () => {
      await expect(
        service.create('u1', { circleId: 'c1', name: 'Bad Hook', url: 'https://localhost:3000/admin', events: ['post.created'] }),
      ).rejects.toThrow();
    });

    it('should reject private IP URLs', async () => {
      await expect(
        service.create('u1', { circleId: 'c1', name: 'Bad Hook', url: 'https://192.168.1.1/hook', events: ['post.created'] }),
      ).rejects.toThrow();
    });

    it('should reject cloud metadata URLs', async () => {
      await expect(
        service.create('u1', { circleId: 'c1', name: 'Bad Hook', url: 'https://169.254.169.254/latest/meta-data/', events: ['post.created'] }),
      ).rejects.toThrow();
    });

    it('should reject internal network URLs in deliver()', async () => {
      await expect(
        service.deliver('https://10.0.0.1/internal', 'secret', { event: 'test' }),
      ).rejects.toThrow();
    });

    it('should allow valid HTTPS URLs', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
      const result = await service.deliver('https://api.example.com/webhook', 'secret', { event: 'test' });
      expect(result.success).toBe(true);
    });
  });

  describe('webhook event validation', () => {
    it('should filter invalid event names', async () => {
      await service.create('u1', {
        circleId: 'c1', name: 'Test',
        url: 'https://example.com/hook',
        events: ['post.created', 'invalid.event', 'member.joined'],
      });
      expect(prisma.webhook.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            events: ['post.created', 'member.joined'],
          }),
        }),
      );
    });

    it('should reject if no valid events provided', async () => {
      await expect(
        service.create('u1', {
          circleId: 'c1', name: 'Test',
          url: 'https://example.com/hook',
          events: ['invalid', 'also.invalid'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

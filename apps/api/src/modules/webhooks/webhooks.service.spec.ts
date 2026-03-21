import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: any;

  beforeEach(async () => {
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
                events: ['message.created'], secret: 'abc123', createdById: 'u1',
              }),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue({ id: 'wh-1', createdById: 'u1' }),
              delete: jest.fn().mockResolvedValue({}),
              update: jest.fn().mockResolvedValue({}),
            },
            webhookDelivery: {
              create: jest.fn().mockResolvedValue({}),
              findMany: jest.fn().mockResolvedValue([]),
            },
          },
        },
      ],
    }).compile();

    service = module.get(WebhooksService);
    prisma = module.get(PrismaService) as any;
  });

  it('should create a webhook', async () => {
    const result = await service.create('u1', {
      circleId: 'c1', name: 'Test Hook',
      url: 'https://example.com/hook', events: ['message.created'],
    });
    expect(result.name).toBe('Test Hook');
    expect(result.secret).toBeDefined();
  });

  it('should list webhooks for a circle', async () => {
    const result = await service.list('c1');
    expect(Array.isArray(result)).toBe(true);
  });

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

  describe('test', () => {
    it('should throw NotFoundException when webhook not found', async () => {
      prisma.webhook.findUnique.mockResolvedValue(null);
      await expect(service.test('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deliver', () => {
    it('should compute HMAC-SHA256 signature and send payload', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;

      const result = await service.deliver('https://example.com/webhook', 'secret123', { event: 'test', data: {} });
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);

      global.fetch = originalFetch;
    });

    it('should retry on failure and return success=false after exhausting retries', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as any;

      const result = await service.deliver('https://example.com/webhook', 'secret', { event: 'test' });
      expect(result.success).toBe(false);

      global.fetch = originalFetch;
    });

    it('should include X-Mizanly-Signature header', async () => {
      const originalFetch = global.fetch;
      const mockFetchFn = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = mockFetchFn as any;

      await service.deliver('https://example.com/hook', 'secret', { event: 'test' });
      expect(mockFetchFn).toHaveBeenCalledWith('https://example.com/hook', expect.objectContaining({
        headers: expect.objectContaining({
          'X-Mizanly-Signature': expect.stringContaining('sha256='),
        }),
      }));

      global.fetch = originalFetch;
    });

    it('should succeed on second attempt after first failure', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ ok: true, status: 200 }) as any;

      const result = await service.deliver('https://example.com/hook', 'secret', { event: 'test' });
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);

      global.fetch = originalFetch;
    });

    it('should return success=false for non-ok HTTP responses', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;

      const result = await service.deliver('https://example.com/hook', 'secret', { event: 'test' });
      expect(result.success).toBe(false);

      global.fetch = originalFetch;
    });
  });

  describe('dispatch', () => {
    it('should dispatch to matching webhooks', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;

      prisma.webhook.findMany.mockResolvedValue([
        { id: 'wh-1', url: 'https://example.com/hook1', secret: 'sec1', events: ['post.created'], isActive: true },
        { id: 'wh-2', url: 'https://example.com/hook2', secret: 'sec2', events: ['member.joined'], isActive: true },
      ]);

      const result = await service.dispatch('c1', 'post.created', { postId: 'p1' });
      expect(result.dispatched).toBe(1);

      global.fetch = originalFetch;
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
  });

  describe('test — with url', () => {
    it('should deliver test payload', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;

      prisma.webhook.findUnique.mockResolvedValue({ id: 'wh-1', url: 'https://example.com/hook', secret: 'sec', createdById: 'u1' });
      const result = await service.test('wh-1', 'u1');
      expect(result.success).toBe(true);

      global.fetch = originalFetch;
    });
  });
});

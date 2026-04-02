import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../config/prisma.service';
import { WebhookProcessor } from './webhook.processor';
import { QueueService } from '../queue.service';

// Mock DNS so SSRF validation resolves hostnames deterministically
jest.mock('dns', () => {
  const original = jest.requireActual('dns');
  return {
    ...original,
    promises: {
      ...original.promises,
      lookup: jest.fn().mockImplementation((hostname: string) => {
        if (hostname === 'localhost') return Promise.resolve({ address: '127.0.0.1', family: 4 });
        // Default: public IP
        return Promise.resolve({ address: '93.184.216.34', family: 4 });
      }),
    },
  };
});

describe('WebhookProcessor', () => {
  let processor: WebhookProcessor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookProcessor,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(null) } },
        {
          provide: PrismaService,
          useValue: { webhook: { update: jest.fn().mockResolvedValue({}) } },
        },
        {
          provide: QueueService,
          useValue: {
            moveToDlq: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: 'REDIS', useValue: { set: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null), del: jest.fn().mockResolvedValue(1) } },
      ],
    }).compile();

    processor = module.get(WebhookProcessor);
  });

  describe('URL validation', () => {
    it('should reject HTTP URLs', async () => {
      const job = {
        data: { url: 'http://example.com/hook', signature: 'abc123', timestamp: '12345', event: 'test', payload: {}, webhookId: 'wh1' },
        attemptsMade: 0, opts: { attempts: 5 }, id: 'j1', updateProgress: jest.fn(),
      };
      await expect((processor as any).deliverWebhook(job)).rejects.toThrow('HTTPS');
    });

    it('should reject localhost', async () => {
      const job = {
        data: { url: 'https://localhost:3000/admin', signature: 'abc123', timestamp: '12345', event: 'test', payload: {}, webhookId: 'wh1' },
        attemptsMade: 0, opts: { attempts: 5 }, id: 'j1', updateProgress: jest.fn(),
      };
      await expect((processor as any).deliverWebhook(job)).rejects.toThrow(/private/i);
    });

    it('should reject private IPs', async () => {
      const job = {
        data: { url: 'https://192.168.1.1/hook', signature: 'abc123', timestamp: '12345', event: 'test', payload: {}, webhookId: 'wh1' },
        attemptsMade: 0, opts: { attempts: 5 }, id: 'j1', updateProgress: jest.fn(),
      };
      await expect((processor as any).deliverWebhook(job)).rejects.toThrow(/private/i);
    });

    it('should reject cloud metadata URLs', async () => {
      const job = {
        data: { url: 'https://169.254.169.254/latest', signature: 'abc123', timestamp: '12345', event: 'test', payload: {}, webhookId: 'wh1' },
        attemptsMade: 0, opts: { attempts: 5 }, id: 'j1', updateProgress: jest.fn(),
      };
      await expect((processor as any).deliverWebhook(job)).rejects.toThrow(/private/i);
    });
  });

  describe('job validation', () => {
    it('should return early for missing required fields', async () => {
      const job = {
        data: { url: '', signature: '', event: '', payload: {}, webhookId: 'wh1' },
        attemptsMade: 0, opts: { attempts: 5 }, id: 'j1', updateProgress: jest.fn(),
      };
      // Should not throw — just returns silently
      await expect((processor as any).deliverWebhook(job)).resolves.toBeUndefined();
    });
  });

  describe('HMAC signature', () => {
    it('should include timestamp in signature (anti-replay)', async () => {
      const originalFetch = global.fetch;
      let capturedHeaders: Record<string, string> = {};
      global.fetch = jest.fn().mockImplementation((_url: string, opts: any) => {
        capturedHeaders = opts.headers;
        return Promise.resolve({ ok: true, status: 200 });
      }) as any;

      const job = {
        data: { url: 'https://example.com/hook', signature: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', timestamp: '1234567890', event: 'post.created', payload: { id: 'p1' }, webhookId: 'wh1' },
        attemptsMade: 0, opts: { attempts: 5 }, id: 'j1', updateProgress: jest.fn(),
      };
      await (processor as any).deliverWebhook(job);

      expect(capturedHeaders['X-Mizanly-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(capturedHeaders['X-Mizanly-Timestamp']).toBeDefined();

      global.fetch = originalFetch;
    });
  });
});

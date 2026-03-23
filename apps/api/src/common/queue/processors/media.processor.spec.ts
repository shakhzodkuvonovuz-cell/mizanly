import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MediaProcessor } from './media.processor';
import { PrismaService } from '../../../config/prisma.service';
import { QueueService } from '../queue.service';

// Mock bullmq Worker so onModuleInit doesn't create a real Redis connection
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_name, _processor, _opts) => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  Job: jest.fn(),
}));

describe('MediaProcessor', () => {
  let processor: MediaProcessor;
  let prisma: any;
  let configGet: jest.Mock;

  const buildModule = async (redisUrl: string | null) => {
    configGet = jest.fn().mockReturnValue(redisUrl);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaProcessor,
        { provide: ConfigService, useValue: { get: configGet } },
        {
          provide: PrismaService,
          useValue: {
            reel: { update: jest.fn().mockResolvedValue({}) },
            post: { update: jest.fn().mockResolvedValue({}) },
          },
        },
        {
          provide: QueueService,
          useValue: {
            moveToDlq: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    processor = module.get(MediaProcessor);
    prisma = module.get(PrismaService);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should not create worker when REDIS_URL is not set', async () => {
    await buildModule(null);
    processor.onModuleInit();
    expect((processor as any).worker).toBeNull();
  });

  it('should create worker when REDIS_URL is set', async () => {
    await buildModule('redis://localhost:6379');
    processor.onModuleInit();
    expect((processor as any).worker).not.toBeNull();
  });

  describe('validateMediaUrl (via reflection)', () => {
    beforeEach(async () => {
      await buildModule(null);
    });

    it('should accept valid HTTPS URLs', () => {
      expect(() => (processor as any).validateMediaUrl('https://cdn.example.com/image.jpg')).not.toThrow();
    });

    it('should reject HTTP URLs', () => {
      expect(() => (processor as any).validateMediaUrl('http://example.com/image.jpg')).toThrow('Only HTTPS allowed');
    });

    it('should reject localhost', () => {
      expect(() => (processor as any).validateMediaUrl('https://localhost:3000/img.jpg')).toThrow('Internal URLs blocked');
    });

    it('should reject private IPs (192.168.x.x)', () => {
      expect(() => (processor as any).validateMediaUrl('https://192.168.1.1/img.jpg')).toThrow('Internal URLs blocked');
    });

    it('should reject cloud metadata IPs (169.254.x.x)', () => {
      expect(() => (processor as any).validateMediaUrl('https://169.254.169.254/latest')).toThrow('Internal URLs blocked');
    });
  });

  describe('processImageResize (via reflection)', () => {
    it('should reject internal URLs before processing', async () => {
      await buildModule(null);
      const job = { data: { mediaUrl: 'http://localhost/evil.jpg', mediaKey: 'k1' }, updateProgress: jest.fn() };
      await expect((processor as any).processImageResize(job)).rejects.toThrow('Only HTTPS allowed');
    });
  });

  describe('processBlurHash (via reflection)', () => {
    it('should reject internal URLs before processing', async () => {
      await buildModule(null);
      const job = {
        data: { mediaUrl: 'https://127.0.0.1/img.jpg', mediaKey: 'k1', contentType: 'post', contentId: 'p1' },
        updateProgress: jest.fn(),
      };
      await expect((processor as any).processBlurHash(job)).rejects.toThrow('Internal URLs blocked');
    });
  });

  it('should close worker on module destroy', async () => {
    await buildModule('redis://localhost:6379');
    processor.onModuleInit();
    const worker = (processor as any).worker;
    await processor.onModuleDestroy();
    expect(worker.close).toHaveBeenCalled();
  });

  it('should not throw on destroy when worker is null', async () => {
    await buildModule(null);
    processor.onModuleInit();
    await expect(processor.onModuleDestroy()).resolves.not.toThrow();
  });
});

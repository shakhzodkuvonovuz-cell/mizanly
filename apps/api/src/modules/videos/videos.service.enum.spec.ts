import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { VideosService } from './videos.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('VideosService — enum validation', () => {
  let service: VideosService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        VideosService,
        {
          provide: PrismaService,
          useValue: {
            video: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            videoReaction: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            videoBookmark: { findMany: jest.fn().mockResolvedValue([]) },
            videoComment: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
            channel: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            subscription: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', isPrivate: false }) },
            block: { findMany: jest.fn().mockResolvedValue([]) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            report: { create: jest.fn().mockResolvedValue({ id: 'r1' }) },
          },
        },
      ],
    }).compile();

    service = module.get(VideosService);
    prisma = module.get(PrismaService);
  });

  it('should reject invalid video category', async () => {
    await expect(
      service.getFeed('u1', 'INVALID_CATEGORY'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should accept valid category EDUCATION', async () => {
    prisma.video.findMany.mockResolvedValue([]);
    const result = await service.getFeed('u1', 'EDUCATION');
    expect(result).toBeDefined();
  });

  it('should accept category "all" (no filter)', async () => {
    prisma.video.findMany.mockResolvedValue([]);
    const result = await service.getFeed('u1', 'all');
    expect(result).toBeDefined();
  });

  it('should accept no category', async () => {
    prisma.video.findMany.mockResolvedValue([]);
    const result = await service.getFeed('u1');
    expect(result).toBeDefined();
  });
});

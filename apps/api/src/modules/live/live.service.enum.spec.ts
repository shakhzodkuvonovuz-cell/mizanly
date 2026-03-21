import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LiveService } from './live.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('LiveService — enum validation', () => {
  let service: LiveService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        LiveService,
        {
          provide: PrismaService,
          useValue: {
            liveSession: {
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn(),
              create: jest.fn().mockResolvedValue({ id: 'live-1' }),
              update: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            liveParticipant: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', username: 'test' }) },
            follow: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();

    service = module.get(LiveService);
    prisma = module.get(PrismaService);
  });

  it('should reject invalid liveType in getActive', async () => {
    await expect(service.getActive('INVALID_TYPE')).rejects.toThrow(BadRequestException);
  });

  it('should accept valid liveType VIDEO_STREAM', async () => {
    prisma.liveSession.findMany.mockResolvedValue([]);
    const result = await service.getActive('VIDEO_STREAM');
    expect(result).toBeDefined();
  });

  it('should accept valid liveType AUDIO_SPACE', async () => {
    prisma.liveSession.findMany.mockResolvedValue([]);
    const result = await service.getActive('AUDIO_SPACE');
    expect(result).toBeDefined();
  });

  it('should accept undefined liveType (no filter)', async () => {
    prisma.liveSession.findMany.mockResolvedValue([]);
    const result = await service.getActive();
    expect(result).toBeDefined();
  });
});

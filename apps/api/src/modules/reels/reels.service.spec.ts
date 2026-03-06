import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { ReelsService } from './reels.service';

describe('ReelsService', () => {
  let service: ReelsService;
  let prisma: jest.Mocked<PrismaService>;
  let redis: jest.Mocked<Redis>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReelsService,
        {
          provide: PrismaService,
          useValue: {
            reel: {
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReelsService>(ReelsService);
    prisma = module.get(PrismaService);
    redis = module.get('REDIS');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
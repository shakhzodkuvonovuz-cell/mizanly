import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { RetentionService } from './retention.service';

describe('RetentionService', () => {
  let service: RetentionService;
  let redis: any;

  beforeEach(async () => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      lpush: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionService,
        {
          provide: PrismaService,
          useValue: {},
        },
        { provide: 'REDIS', useValue: redis },
      ],
    }).compile();

    service = module.get<RetentionService>(RetentionService);
  });

  describe('trackSessionDepth', () => {
    it('should store session data in Redis', async () => {
      await service.trackSessionDepth('user-1', {
        scrollDepth: 500, timeSpentMs: 30000, interactionCount: 5, space: 'saf',
      });
      expect(redis.lpush).toHaveBeenCalled();
      expect(redis.expire).toHaveBeenCalled();
    });

    it('should set 7 day TTL on session data', async () => {
      await service.trackSessionDepth('user-1', {
        scrollDepth: 100, timeSpentMs: 5000, interactionCount: 1, space: 'bakra',
      });
      expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 604800);
    });
  });
});

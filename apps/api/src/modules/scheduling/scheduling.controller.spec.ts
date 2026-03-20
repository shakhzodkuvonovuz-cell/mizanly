import { Test, TestingModule } from '@nestjs/testing';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('SchedulingController', () => {
  let controller: SchedulingController;
  let service: jest.Mocked<SchedulingService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulingController],
      providers: [
        ...globalMockProviders,
        {
          provide: SchedulingService,
          useValue: {
            getScheduled: jest.fn(),
            updateSchedule: jest.fn(),
            cancelSchedule: jest.fn(),
            publishNow: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(SchedulingController);
    service = module.get(SchedulingService) as jest.Mocked<SchedulingService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getScheduled', () => {
    it('should call schedulingService.getScheduled with userId', async () => {
      service.getScheduled.mockResolvedValue([{ id: 'sch-1', type: 'post' }] as any);

      const result = await controller.getScheduled(userId);

      expect(service.getScheduled).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('updateSchedule', () => {
    it('should call schedulingService.updateSchedule with userId, type, id, and Date', async () => {
      service.updateSchedule.mockResolvedValue({ id: 'post-1', scheduledAt: '2026-04-01' } as any);

      await controller.updateSchedule(userId, 'post', 'post-1', { scheduledAt: '2026-04-01T10:00:00Z' } as any);

      expect(service.updateSchedule).toHaveBeenCalledWith(userId, 'post', 'post-1', expect.any(Date));
    });
  });

  describe('cancelSchedule', () => {
    it('should call schedulingService.cancelSchedule with userId, type, and id', async () => {
      service.cancelSchedule.mockResolvedValue({ cancelled: true } as any);

      await controller.cancelSchedule(userId, 'thread', 'thread-1');

      expect(service.cancelSchedule).toHaveBeenCalledWith(userId, 'thread', 'thread-1');
    });
  });

  describe('publishNow', () => {
    it('should call schedulingService.publishNow with userId, type, and id', async () => {
      service.publishNow.mockResolvedValue({ published: true } as any);

      await controller.publishNow(userId, 'reel', 'reel-1');

      expect(service.publishNow).toHaveBeenCalledWith(userId, 'reel', 'reel-1');
    });
  });
});

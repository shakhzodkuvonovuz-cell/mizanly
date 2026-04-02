import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let redis: any;
  let pipelineMock: any;

  beforeEach(async () => {
    pipelineMock = {
      incrby: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      lpush: jest.fn().mockReturnThis(),
      ltrim: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    redis = {
      get: jest.fn().mockResolvedValue(null),
      mget: jest.fn().mockResolvedValue([]),
      pipeline: jest.fn().mockReturnValue(pipelineMock),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: 'REDIS', useValue: redis },
      ],
    }).compile();

    service = module.get(AnalyticsService);

    // Prevent timer leaking into test runtime
    if ((service as any).flushTimer) {
      clearInterval((service as any).flushTimer);
      (service as any).flushTimer = null;
    }
  });

  afterEach(() => {
    // Cleanup timer
    if ((service as any).flushTimer) {
      clearInterval((service as any).flushTimer);
    }
    jest.clearAllMocks();
  });

  // ── track ──

  describe('track', () => {
    it('should buffer events', () => {
      service.track('page_view', 'user-1', { page: '/home' });
      const buffer = (service as any).buffer;
      expect(buffer.length).toBe(1);
      expect(buffer[0].event).toBe('page_view');
      expect(buffer[0].userId).toBe('user-1');
      expect(buffer[0].properties).toEqual({ page: '/home' });
      expect(buffer[0].timestamp).toBeDefined();
    });

    it('should auto-flush when buffer reaches 100 events', () => {
      const flushSpy = jest.spyOn(service as any, 'flush');
      for (let i = 0; i < 100; i++) {
        service.track(`event_${i}`);
      }
      expect(flushSpy).toHaveBeenCalled();
    });

    it('should not auto-flush below 100 events', () => {
      const flushSpy = jest.spyOn(service as any, 'flush');
      for (let i = 0; i < 99; i++) {
        service.track(`event_${i}`);
      }
      expect(flushSpy).not.toHaveBeenCalled();
    });

    it('should cap buffer at MAX_BUFFER_SIZE and drop oldest events', () => {
      const MAX = (service as any).MAX_BUFFER_SIZE;
      // Prevent auto-flush from emptying the buffer
      jest.spyOn(service as any, 'flush').mockResolvedValue(undefined);

      // Manually fill buffer to max
      (service as any).buffer = Array.from({ length: MAX }, (_, i) => ({
        event: `old_${i}`,
        timestamp: new Date().toISOString(),
      }));

      service.track('new_event');
      const buffer = (service as any).buffer;
      // Buffer should not exceed MAX_BUFFER_SIZE
      expect(buffer.length).toBeLessThanOrEqual(MAX);
      // Newest event should be at the end
      expect(buffer[buffer.length - 1].event).toBe('new_event');
    });

    it('should track without userId or properties', () => {
      service.track('app_open');
      const buffer = (service as any).buffer;
      expect(buffer[0].userId).toBeUndefined();
      expect(buffer[0].properties).toBeUndefined();
    });
  });

  // ── increment ──

  describe('increment', () => {
    it('should increment counter with pipeline + 24h TTL', async () => {
      await service.increment('daily_signups', 5);

      expect(redis.pipeline).toHaveBeenCalled();
      expect(pipelineMock.incrby).toHaveBeenCalledWith('analytics:counter:daily_signups', 5);
      expect(pipelineMock.expire).toHaveBeenCalledWith('analytics:counter:daily_signups', 86400);
      expect(pipelineMock.exec).toHaveBeenCalled();
    });

    it('should default amount to 1', async () => {
      await service.increment('clicks');

      expect(pipelineMock.incrby).toHaveBeenCalledWith('analytics:counter:clicks', 1);
    });
  });

  // ── getCounter ──

  describe('getCounter', () => {
    it('should return parsed integer value', async () => {
      redis.get.mockResolvedValue('42');
      const result = await service.getCounter('daily_signups');
      expect(result).toBe(42);
      expect(redis.get).toHaveBeenCalledWith('analytics:counter:daily_signups');
    });

    it('should return 0 when counter does not exist', async () => {
      redis.get.mockResolvedValue(null);
      const result = await service.getCounter('nonexistent');
      expect(result).toBe(0);
    });
  });

  // ── getCounters ──

  describe('getCounters', () => {
    it('should return multiple counters via mget', async () => {
      redis.mget.mockResolvedValue(['10', '20', null]);
      const result = await service.getCounters(['a', 'b', 'c']);

      expect(result).toEqual({ a: 10, b: 20, c: 0 });
      expect(redis.mget).toHaveBeenCalledWith(
        'analytics:counter:a',
        'analytics:counter:b',
        'analytics:counter:c',
      );
    });

    it('should return empty object for empty input', async () => {
      const result = await service.getCounters([]);
      expect(result).toEqual({});
      expect(redis.mget).not.toHaveBeenCalled();
    });
  });

  // ── flush (private) ──

  describe('flush', () => {
    it('should push events to Redis list with ltrim and expire', async () => {
      service.track('ev1');
      service.track('ev2');

      await (service as any).flush();

      expect(pipelineMock.lpush).toHaveBeenCalledTimes(2);
      expect(pipelineMock.ltrim).toHaveBeenCalledWith('analytics:events', 0, 99_999);
      expect(pipelineMock.expire).toHaveBeenCalledWith('analytics:events', 7 * 86400);
      expect(pipelineMock.exec).toHaveBeenCalled();
      expect((service as any).buffer.length).toBe(0);
    });

    it('should not flush when buffer is empty', async () => {
      await (service as any).flush();
      expect(redis.pipeline).not.toHaveBeenCalled();
    });

    it('should put events back in buffer on Redis error for retry', async () => {
      service.track('ev1');
      service.track('ev2');
      pipelineMock.exec.mockRejectedValue(new Error('Redis pipeline failed'));

      await (service as any).flush();

      // Events should be back in buffer
      expect((service as any).buffer.length).toBe(2);
      expect((service as any).buffer[0].event).toBe('ev1');
    });
  });

  // ── onModuleDestroy ──

  describe('onModuleDestroy', () => {
    it('should clear interval and flush remaining events', async () => {
      service.track('final_event');
      const flushSpy = jest.spyOn(service as any, 'flush');

      await service.onModuleDestroy();

      expect(flushSpy).toHaveBeenCalled();
    });
  });
});

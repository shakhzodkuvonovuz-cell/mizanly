import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationProcessor } from './notification.processor';
import { PushTriggerService } from '../../../modules/notifications/push-trigger.service';
import { PushService } from '../../../modules/notifications/push.service';
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

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;
  let pushTrigger: any;
  let pushService: any;
  let prisma: any;
  let configGet: jest.Mock;

  const buildModule = async (redisUrl: string | null) => {
    configGet = jest.fn().mockReturnValue(redisUrl);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationProcessor,
        { provide: ConfigService, useValue: { get: configGet } },
        {
          provide: PushTriggerService,
          useValue: {
            triggerPush: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PushService,
          useValue: {
            sendToUsers: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            notification: {
              createMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
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

    processor = module.get(NotificationProcessor);
    pushTrigger = module.get(PushTriggerService);
    pushService = module.get(PushService);
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

  describe('processPushTrigger (via reflection)', () => {
    it('should call pushTrigger.triggerPush with notificationId', async () => {
      await buildModule(null);
      const job = { data: { notificationId: 'notif-123' } };
      await (processor as any).processPushTrigger(job);
      expect(pushTrigger.triggerPush).toHaveBeenCalledWith('notif-123');
    });
  });

  describe('processBulkPush (via reflection)', () => {
    it('should persist notification records and call pushService.sendToUsers', async () => {
      await buildModule(null);
      const job = {
        data: {
          userIds: ['u1', 'u2', 'u3'],
          title: 'New Feature',
          body: 'Check out the latest update',
          pushData: { screen: 'settings' },
        },
      };
      await (processor as any).processBulkPush(job);
      // Verify DB records created before push
      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'u1', title: 'New Feature', body: 'Check out the latest update' }),
          expect.objectContaining({ userId: 'u2' }),
          expect.objectContaining({ userId: 'u3' }),
        ]),
        skipDuplicates: true,
      });
      expect(pushService.sendToUsers).toHaveBeenCalledWith(
        ['u1', 'u2', 'u3'],
        { title: 'New Feature', body: 'Check out the latest update', data: { screen: 'settings' } },
      );
    });

    it('should handle missing pushData (undefined)', async () => {
      await buildModule(null);
      const job = {
        data: {
          userIds: ['u1'],
          title: 'Alert',
          body: 'Something happened',
        },
      };
      await (processor as any).processBulkPush(job);
      expect(prisma.notification.createMany).toHaveBeenCalled();
      expect(pushService.sendToUsers).toHaveBeenCalledWith(
        ['u1'],
        { title: 'Alert', body: 'Something happened', data: undefined },
      );
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

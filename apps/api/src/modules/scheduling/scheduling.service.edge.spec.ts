import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { SchedulingService } from './scheduling.service';
import { PublishWorkflowService } from '../../common/services/publish-workflow.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QueueService } from '../../common/queue/queue.service';

describe('SchedulingService — edge cases', () => {
  let service: SchedulingService;
  let prisma: any;
  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingService,
        {
          provide: PrismaService,
          useValue: {
            post: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            thread: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            reel: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            video: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
          },
        },
        { provide: PublishWorkflowService, useValue: { onPublish: jest.fn(), onUnpublish: jest.fn() } },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: QueueService, useValue: { addSearchIndexJob: jest.fn(), addPushNotificationJob: jest.fn() } },
        { provide: 'REDIS', useValue: { set: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null), del: jest.fn().mockResolvedValue(1) } },
      ],
    }).compile();

    service = module.get<SchedulingService>(SchedulingService);
    prisma = module.get(PrismaService);
  });

  it('should reject scheduling in the past (less than 15 minutes from now)', async () => {
    prisma.post.findUnique.mockResolvedValue({ id: 'post-1', userId });
    const pastDate = new Date(Date.now() - 60000); // 1 minute ago
    await expect(service.updateSchedule(userId, 'post', 'post-1', pastDate))
      .rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException when cancelling non-existent scheduled post', async () => {
    prisma.post.findUnique.mockResolvedValue(null);
    await expect(service.cancelSchedule(userId, 'post', 'nonexistent'))
      .rejects.toThrow(NotFoundException);
  });

  it('should return empty list when no scheduled content exists', async () => {
    const result = await service.getScheduled(userId);
    expect(result).toEqual([]);
  });
});

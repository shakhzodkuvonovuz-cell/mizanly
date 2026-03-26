import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { SchedulingService } from './scheduling.service';
import { PublishWorkflowService } from '../../common/services/publish-workflow.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QueueService } from '../../common/queue/queue.service';

describe('SchedulingService — authorization matrix', () => {
  let service: SchedulingService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';

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
      ],
    }).compile();

    service = module.get<SchedulingService>(SchedulingService);
    prisma = module.get(PrismaService);
  });

  it('should throw ForbiddenException when non-owner cancels schedule', async () => {
    prisma.post.findUnique.mockResolvedValue({ id: 'post-1', userId: userA });
    await expect(service.cancelSchedule(userB, 'post', 'post-1'))
      .rejects.toThrow(ForbiddenException);
  });

  it('should allow owner to cancel schedule', async () => {
    prisma.post.findUnique.mockResolvedValue({ id: 'post-1', userId: userA });
    prisma.post.update.mockResolvedValue({ id: 'post-1', scheduledAt: null });
    const result = await service.cancelSchedule(userA, 'post', 'post-1');
    expect(result).toBeDefined();
    expect(result.scheduledAt).toBeNull();
  });

  it('should only return own scheduled posts', async () => {
    const result = await service.getScheduled(userA);
    expect(result).toEqual([]);
    // All 4 findMany calls should filter by userId
    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: userA }) }),
    );
  });

  it('should throw NotFoundException when cancelling non-existent post', async () => {
    prisma.post.findUnique.mockResolvedValue(null);
    await expect(service.cancelSchedule(userA, 'post', 'nonexistent'))
      .rejects.toThrow(NotFoundException);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { DiscordFeaturesService } from './discord-features.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('DiscordFeaturesService', () => {
  let service: DiscordFeaturesService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  const mockThread = {
    id: 'thread-1', circleId: 'circle-1', authorId: 'user-1',
    title: 'Test Thread', content: 'Hello world', tags: [],
    isPinned: false, isLocked: false, replyCount: 0,
  };

  const mockWebhook = {
    id: 'wh-1', circleId: 'circle-1', createdById: 'user-1',
    name: 'Test Webhook', token: 'test-token', isActive: true,
  };

  const mockStage = {
    id: 'stage-1', circleId: 'circle-1', hostId: 'user-1',
    title: 'Live Q&A', status: 'scheduled', speakerIds: ['user-1'],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        DiscordFeaturesService,
        {
          provide: PrismaService,
          useValue: {
            forumThread: {
              create: jest.fn().mockResolvedValue(mockThread),
              findMany: jest.fn().mockResolvedValue([mockThread]),
              findUnique: jest.fn().mockResolvedValue(mockThread),
              update: jest.fn().mockResolvedValue(mockThread),
            },
            forumReply: {
              create: jest.fn().mockResolvedValue({ id: 'reply-1', threadId: 'thread-1', content: 'Reply' }),
              findMany: jest.fn().mockResolvedValue([]),
            },
            webhook: {
              create: jest.fn().mockResolvedValue(mockWebhook),
              findMany: jest.fn().mockResolvedValue([mockWebhook]),
              findFirst: jest.fn().mockResolvedValue(mockWebhook),
              findUnique: jest.fn().mockResolvedValue(mockWebhook),
              count: jest.fn().mockResolvedValue(3),
              update: jest.fn().mockResolvedValue(mockWebhook),
              delete: jest.fn().mockResolvedValue(mockWebhook),
            },
            stageSession: {
              create: jest.fn().mockResolvedValue(mockStage),
              findFirst: jest.fn().mockResolvedValue(mockStage),
              findMany: jest.fn().mockResolvedValue([mockStage]),
              update: jest.fn().mockResolvedValue(mockStage),
            },
            circleMember: {
              findUnique: jest.fn().mockResolvedValue({ circleId: 'circle-1', userId: 'user-1' }),
            },
          } as any,
        },
      ],
    }).compile();

    service = module.get(DiscordFeaturesService);
    prisma = module.get(PrismaService);
  });

  describe('Forum Threads', () => {
    it('should create a forum thread', async () => {
      const result = await service.createForumThread('user-1', 'circle-1', {
        title: 'Test Thread', content: 'Hello world',
      });
      expect(result).toEqual(mockThread);
      expect(prisma.forumThread.create).toHaveBeenCalled();
    });

    it('should get forum threads with pagination', async () => {
      const result = await service.getForumThreads('circle-1');
      expect(result.data).toBeDefined();
      expect(result.meta).toBeDefined();
    });

    it('should throw NotFoundException for missing thread', async () => {
      prisma.forumThread.findUnique.mockResolvedValue(null);
      await expect(service.getForumThread('missing-id')).rejects.toThrow(NotFoundException);
    });

    it('should not allow reply to locked thread', async () => {
      prisma.forumThread.findUnique.mockResolvedValue({ ...mockThread, isLocked: true });
      await expect(service.replyToForumThread('user-2', 'thread-1', 'Reply'))
        .rejects.toThrow(ForbiddenException);
    });

    it('should toggle pin on thread', async () => {
      const result = await service.pinForumThread('thread-1', 'user-1');
      expect(prisma.forumThread.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isPinned: true } }),
      );
    });
  });

  describe('Webhooks', () => {
    it('should create a webhook', async () => {
      const result = await service.createWebhook('user-1', 'circle-1', { name: 'Test' });
      expect(result).toEqual(mockWebhook);
    });

    it('should reject when max webhooks reached', async () => {
      prisma.webhook.count.mockResolvedValue(15);
      await expect(service.createWebhook('user-1', 'circle-1', { name: 'New' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should execute webhook with valid token', async () => {
      const result = await service.executeWebhook('test-token', { content: 'Hello' });
      expect(result.success).toBe(true);
    });

    it('should reject webhook execution with invalid token', async () => {
      prisma.webhook.findUnique.mockResolvedValue(null);
      await expect(service.executeWebhook('bad-token', { content: 'Hello' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should reject webhook execution with empty content', async () => {
      await expect(service.executeWebhook('test-token', { content: '' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should reject webhook execution with content over 4000 chars', async () => {
      await expect(service.executeWebhook('test-token', { content: 'x'.repeat(4001) }))
        .rejects.toThrow(BadRequestException);
    });

    it('should delete webhook by owner', async () => {
      await service.deleteWebhook('wh-1', 'user-1');
      expect(prisma.webhook.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when deleting non-owned webhook', async () => {
      prisma.webhook.findFirst.mockResolvedValue(null);
      await expect(service.deleteWebhook('wh-1', 'user-2')).rejects.toThrow(NotFoundException);
    });
  });

  describe('Stage Sessions', () => {
    it('should create a stage session', async () => {
      const result = await service.createStageSession('user-1', 'circle-1', { title: 'Q&A' });
      expect(result).toEqual(mockStage);
    });

    it('should start a stage session by host', async () => {
      await service.startStageSession('stage-1', 'user-1');
      expect(prisma.stageSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'live' }) }),
      );
    });

    it('should throw NotFoundException when non-host tries to start', async () => {
      prisma.stageSession.findFirst.mockResolvedValue(null);
      await expect(service.startStageSession('stage-1', 'user-2')).rejects.toThrow(NotFoundException);
    });

    it('should invite speaker to stage', async () => {
      await service.inviteSpeaker('stage-1', 'user-1', 'user-2');
      expect(prisma.stageSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { speakerIds: expect.arrayContaining(['user-1', 'user-2']) },
        }),
      );
    });
  });
});

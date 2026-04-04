import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { DiscordFeaturesService } from './discord-features.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('DiscordFeaturesService — edge cases', () => {
  let service: DiscordFeaturesService;
  let prisma: any;
  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        DiscordFeaturesService,
        {
          provide: PrismaService,
          useValue: {
            forumThread: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn() },
            forumReply: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
            webhook: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), count: jest.fn().mockResolvedValue(0), update: jest.fn() },
            stageSession: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            circleMember: { findUnique: jest.fn().mockResolvedValue({ userId, role: 'ADMIN' }) },
            user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-2' }) },
            message: { create: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<DiscordFeaturesService>(DiscordFeaturesService);
    prisma = module.get(PrismaService);
  });

  it('should accept Arabic forum thread title', async () => {
    prisma.forumThread.create.mockResolvedValue({ id: 'ft-1', title: 'نقاش في الفقه', circleId: 'c-1', authorId: userId });
    const result = await service.createForumThread(userId, 'c-1', { title: 'نقاش في الفقه', content: 'Body' } as any);
    expect(result).toBeDefined();
    expect(result.title).toBe('نقاش في الفقه');
  });

  it('should return empty forum threads list when none exist', async () => {
    const result = await service.getForumThreads('c-1');
    expect(result.data).toEqual([]);
  });

  it('should throw NotFoundException for non-existent forum thread', async () => {
    prisma.forumThread.findUnique.mockResolvedValue(null);
    await expect(service.getForumThread('nonexistent'))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException for replying to non-existent thread', async () => {
    prisma.forumThread.findUnique.mockResolvedValue(null);
    await expect(service.replyToForumThread(userId, 'nonexistent', 'Reply text'))
      .rejects.toThrow(NotFoundException);
  });

  it('should return empty active stage sessions', async () => {
    const result = await service.getActiveStageSessions();
    expect(result).toEqual([]);
  });

  it('should throw NotFoundException for non-existent webhook deletion', async () => {
    prisma.webhook.findUnique.mockResolvedValue(null);
    await expect(service.deleteWebhook('nonexistent', userId))
      .rejects.toThrow(NotFoundException);
  });

  it('should handle pagination with empty cursor gracefully', async () => {
    const result = await service.getForumReplies('thread-1');
    expect(result.data).toEqual([]);
    expect(result.meta.hasMore).toBe(false);
  });

  it('should handle getForumThreads with custom limit', async () => {
    await service.getForumThreads('c-1', undefined, 5);
    expect(prisma.forumThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 6 }),
    );
  });

  it('should execute webhook and create message when target channel exists', async () => {
    prisma.webhook.findUnique.mockResolvedValue({
      id: 'wh-1', isActive: true, targetChannelId: 'conv-1', circleId: 'c-1',
    });
    prisma.webhook.update.mockResolvedValue({});
    prisma.message.create.mockResolvedValue({ id: 'msg-1' });

    const result = await service.executeWebhook('token', { content: 'Hello from CI' });
    expect(result.webhookId).toBe('wh-1');
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv-1',
          messageType: 'SYSTEM',
        }),
      }),
    );
  });

  it('should handle leaveStageAsListener when audience is already 0', async () => {
    prisma.stageSession.findUnique.mockResolvedValue({
      id: 'stage-1', status: 'live', audienceCount: 0,
    });
    const result = await service.leaveStageAsListener('stage-1', userId);
    expect(result.sessionId).toBe('stage-1');
    expect(prisma.stageSession.update).not.toHaveBeenCalled();
  });

  it('should reject stage join when session is not live', async () => {
    prisma.stageSession.findUnique.mockResolvedValue({
      id: 'stage-1', status: 'ended', audienceCount: 0,
    });
    await expect(service.joinStageAsListener('stage-1', userId))
      .rejects.toThrow(BadRequestException);
  });

  it('should throw on removeSpeaker when trying to remove host', async () => {
    prisma.stageSession.findFirst.mockResolvedValue({
      id: 'stage-1', hostId: userId, speakerIds: [userId, 'user-2'],
    });
    await expect(service.removeSpeaker('stage-1', userId, userId))
      .rejects.toThrow(BadRequestException);
  });

  it('should delete forum thread and all its replies', async () => {
    prisma.forumThread.findUnique.mockResolvedValue({
      id: 'ft-1', circleId: 'c-1', authorId: userId,
      isLocked: false, isPinned: false,
    });
    prisma.forumReply.deleteMany.mockResolvedValue({ count: 3 });
    prisma.forumThread.delete.mockResolvedValue({ id: 'ft-1' });
    await service.deleteForumThread('ft-1', userId);
    expect(prisma.forumReply.deleteMany).toHaveBeenCalledWith({ where: { threadId: 'ft-1' } });
    expect(prisma.forumThread.delete).toHaveBeenCalledWith({ where: { id: 'ft-1' } });
  });
});

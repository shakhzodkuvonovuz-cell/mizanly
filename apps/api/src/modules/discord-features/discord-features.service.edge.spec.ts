import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
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
            forumThread: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            forumReply: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            webhook: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
            stageSession: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            stageSpeaker: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            circleMember: { findUnique: jest.fn().mockResolvedValue({ userId, role: 'ADMIN' }) },
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
    prisma.webhook.findFirst.mockResolvedValue(null);
    await expect(service.deleteWebhook('nonexistent', userId))
      .rejects.toThrow(NotFoundException);
  });
});

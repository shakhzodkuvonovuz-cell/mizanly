import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { DiscordFeaturesService } from './discord-features.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('DiscordFeaturesService', () => {
  let service: DiscordFeaturesService;
  let prisma: any;

  const mockThread = {
    id: 'thread-1', circleId: 'circle-1', authorId: 'user-1',
    title: 'Test Thread', content: 'Hello world', tags: [],
    isPinned: false, isLocked: false, replyCount: 0,
  };

  const mockWebhook = {
    id: 'wh-1', circleId: 'circle-1', createdById: 'user-1',
    name: 'Test Webhook', token: 'test-token', isActive: true,
    targetChannelId: null,
  };

  const mockStage = {
    id: 'stage-1', circleId: 'circle-1', hostId: 'user-1',
    title: 'Live Q&A', status: 'scheduled', speakerIds: ['user-1'],
    audienceCount: 0,
  };

  const mockReply = {
    id: 'reply-1', threadId: 'thread-1', authorId: 'user-1', content: 'Reply',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        DiscordFeaturesService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn().mockImplementation((promises) => Promise.all(promises)),
            forumThread: {
              create: jest.fn().mockResolvedValue(mockThread),
              findMany: jest.fn().mockResolvedValue([mockThread]),
              findUnique: jest.fn().mockResolvedValue(mockThread),
              update: jest.fn().mockResolvedValue(mockThread),
              delete: jest.fn().mockResolvedValue(mockThread),
            },
            forumReply: {
              create: jest.fn().mockResolvedValue(mockReply),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue(mockReply),
              delete: jest.fn().mockResolvedValue(mockReply),
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
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
              findUnique: jest.fn().mockResolvedValue(mockStage),
              findMany: jest.fn().mockResolvedValue([mockStage]),
              update: jest.fn().mockResolvedValue(mockStage),
            },
            circleMember: {
              findUnique: jest.fn().mockResolvedValue({ circleId: 'circle-1', userId: 'user-1', role: 'OWNER' }),
            },
            user: {
              findUnique: jest.fn().mockResolvedValue({ id: 'user-2' }),
            },
            message: {
              create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
            },
          } as any,
        },
      ],
    }).compile();

    service = module.get(DiscordFeaturesService);
    prisma = module.get(PrismaService);
  });

  // ── Forum Thread Creation ─────────────────────────────

  describe('createForumThread', () => {
    it('should create a forum thread for a community member', async () => {
      const result = await service.createForumThread('user-1', 'circle-1', {
        title: 'Test Thread', content: 'Hello world',
      });
      expect(result).toEqual(mockThread);
      expect(prisma.forumThread.create).toHaveBeenCalled();
    });

    it('should reject non-members from creating threads', async () => {
      prisma.circleMember.findUnique.mockResolvedValueOnce(null);
      await expect(service.createForumThread('user-2', 'circle-1', {
        title: 'Test', content: 'Body',
      })).rejects.toThrow(ForbiddenException);
    });

    it('should include tags when provided', async () => {
      await service.createForumThread('user-1', 'circle-1', {
        title: 'Tagged', content: 'Body', tags: ['tag1', 'tag2'],
      });
      expect(prisma.forumThread.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tags: ['tag1', 'tag2'] }),
        }),
      );
    });

    it('should default tags to empty array', async () => {
      await service.createForumThread('user-1', 'circle-1', {
        title: 'No Tags', content: 'Body',
      });
      expect(prisma.forumThread.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tags: [] }),
        }),
      );
    });
  });

  // ── Forum Thread Listing ──────────────────────────────

  describe('getForumThreads', () => {
    it('should return paginated forum threads', async () => {
      const result = await service.getForumThreads('circle-1');
      expect(result.data).toBeDefined();
      expect(result.meta).toBeDefined();
      expect(result.meta.hasMore).toBe(false);
    });

    it('should indicate hasMore when more results exist', async () => {
      const manyThreads = Array.from({ length: 21 }, (_, i) => ({ ...mockThread, id: `t-${i}` }));
      prisma.forumThread.findMany.mockResolvedValue(manyThreads);
      const result = await service.getForumThreads('circle-1');
      expect(result.meta.hasMore).toBe(true);
      expect(result.data.length).toBe(20);
    });

    it('should use Prisma cursor pagination when cursor provided', async () => {
      prisma.forumThread.findMany.mockResolvedValue([]);
      await service.getForumThreads('circle-1', 'cursor-id');
      expect(prisma.forumThread.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1,
          cursor: { id: 'cursor-id' },
        }),
      );
    });

    it('should not use skip/cursor when no cursor provided', async () => {
      prisma.forumThread.findMany.mockResolvedValue([]);
      await service.getForumThreads('circle-1');
      expect(prisma.forumThread.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, cursor: undefined }),
      );
    });
  });

  // ── Forum Thread Detail ───────────────────────────────

  describe('getForumThread', () => {
    it('should return a forum thread by id', async () => {
      const result = await service.getForumThread('thread-1');
      expect(result).toEqual(mockThread);
    });

    it('should throw NotFoundException for missing thread', async () => {
      prisma.forumThread.findUnique.mockResolvedValue(null);
      await expect(service.getForumThread('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Forum Thread Reply ────────────────────────────────

  describe('replyToForumThread', () => {
    it('should reply to a forum thread', async () => {
      prisma.forumThread.findUnique.mockResolvedValue(mockThread);
      const result = await service.replyToForumThread('user-1', 'thread-1', 'Reply text');
      expect(result).toEqual(mockReply);
      expect(prisma.forumReply.create).toHaveBeenCalled();
    });

    it('should increment replyCount on reply', async () => {
      prisma.forumThread.findUnique.mockResolvedValue(mockThread);
      await service.replyToForumThread('user-1', 'thread-1', 'Reply');
      expect(prisma.forumThread.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ replyCount: { increment: 1 } }),
        }),
      );
    });

    it('should reject reply to non-existent thread', async () => {
      prisma.forumThread.findUnique.mockResolvedValue(null);
      await expect(service.replyToForumThread('user-1', 'missing', 'Reply'))
        .rejects.toThrow(NotFoundException);
    });

    it('should reject reply to locked thread', async () => {
      prisma.forumThread.findUnique.mockResolvedValue({ ...mockThread, isLocked: true });
      await expect(service.replyToForumThread('user-1', 'thread-1', 'Reply'))
        .rejects.toThrow(ForbiddenException);
    });

    it('should reject reply from non-member', async () => {
      prisma.forumThread.findUnique.mockResolvedValue(mockThread);
      prisma.circleMember.findUnique.mockResolvedValueOnce(null);
      await expect(service.replyToForumThread('user-3', 'thread-1', 'Reply'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ── Forum Reply Listing ───────────────────────────────

  describe('getForumReplies', () => {
    it('should return paginated forum replies', async () => {
      const result = await service.getForumReplies('thread-1');
      expect(result.data).toBeDefined();
      expect(result.meta).toBeDefined();
    });

    it('should use Prisma cursor pagination when cursor provided', async () => {
      await service.getForumReplies('thread-1', 'cursor-id');
      expect(prisma.forumReply.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1,
          cursor: { id: 'cursor-id' },
        }),
      );
    });
  });

  // ── Forum Thread Lock/Unlock ──────────────────────────

  describe('lockForumThread', () => {
    it('should toggle lock on thread (lock unlocked thread)', async () => {
      prisma.forumThread.findUnique.mockResolvedValue(mockThread); // isLocked: false
      await service.lockForumThread('thread-1', 'user-1');
      expect(prisma.forumThread.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isLocked: true } }),
      );
    });

    it('should toggle lock on thread (unlock locked thread)', async () => {
      prisma.forumThread.findUnique.mockResolvedValue({ ...mockThread, isLocked: true });
      await service.lockForumThread('thread-1', 'user-1');
      expect(prisma.forumThread.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isLocked: false } }),
      );
    });

    it('should throw NotFoundException for missing thread', async () => {
      prisma.forumThread.findUnique.mockResolvedValue(null);
      await expect(service.lockForumThread('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should allow community moderator to lock thread', async () => {
      prisma.forumThread.findUnique.mockResolvedValue({ ...mockThread, authorId: 'other-user' });
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'MODERATOR' });
      await service.lockForumThread('thread-1', 'user-1');
      expect(prisma.forumThread.update).toHaveBeenCalled();
    });

    it('should reject non-author non-moderator from locking', async () => {
      prisma.forumThread.findUnique.mockResolvedValue({ ...mockThread, authorId: 'other-user' });
      prisma.circleMember.findUnique.mockResolvedValueOnce({ role: 'MEMBER' });
      await expect(service.lockForumThread('thread-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Forum Thread Pin ──────────────────────────────────

  describe('pinForumThread', () => {
    it('should toggle pin on thread', async () => {
      prisma.forumThread.findUnique.mockResolvedValue(mockThread); // isPinned: false
      await service.pinForumThread('thread-1', 'user-1');
      expect(prisma.forumThread.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isPinned: true } }),
      );
    });

    it('should unpin a pinned thread', async () => {
      prisma.forumThread.findUnique.mockResolvedValue({ ...mockThread, isPinned: true });
      await service.pinForumThread('thread-1', 'user-1');
      expect(prisma.forumThread.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isPinned: false } }),
      );
    });

    it('should allow community admin to pin thread', async () => {
      prisma.forumThread.findUnique.mockResolvedValue({ ...mockThread, authorId: 'other-user' });
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'ADMIN' });
      await service.pinForumThread('thread-1', 'user-1');
      expect(prisma.forumThread.update).toHaveBeenCalled();
    });

    it('should reject non-author non-admin from pinning', async () => {
      prisma.forumThread.findUnique.mockResolvedValue({ ...mockThread, authorId: 'other-user' });
      prisma.circleMember.findUnique.mockResolvedValueOnce({ role: 'MEMBER' });
      await expect(service.pinForumThread('thread-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Forum Thread Delete ───────────────────────────────

  describe('deleteForumThread', () => {
    it('should delete thread and its replies by author', async () => {
      prisma.forumThread.findUnique.mockResolvedValue(mockThread);
      await service.deleteForumThread('thread-1', 'user-1');
      expect(prisma.forumReply.deleteMany).toHaveBeenCalledWith({ where: { threadId: 'thread-1' } });
      expect(prisma.forumThread.delete).toHaveBeenCalledWith({ where: { id: 'thread-1' } });
    });

    it('should allow community owner to delete any thread', async () => {
      prisma.forumThread.findUnique.mockResolvedValue({ ...mockThread, authorId: 'other-user' });
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      await service.deleteForumThread('thread-1', 'user-1');
      expect(prisma.forumThread.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent thread', async () => {
      prisma.forumThread.findUnique.mockResolvedValue(null);
      await expect(service.deleteForumThread('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should reject non-author non-moderator', async () => {
      prisma.forumThread.findUnique.mockResolvedValue({ ...mockThread, authorId: 'other-user' });
      prisma.circleMember.findUnique.mockResolvedValueOnce({ role: 'MEMBER' });
      await expect(service.deleteForumThread('thread-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Forum Reply Delete ────────────────────────────────

  describe('deleteForumReply', () => {
    it('should delete reply by author and decrement replyCount', async () => {
      prisma.forumReply.findUnique.mockResolvedValue(mockReply);
      await service.deleteForumReply('reply-1', 'user-1');
      expect(prisma.forumReply.delete).toHaveBeenCalledWith({ where: { id: 'reply-1' } });
      expect(prisma.forumThread.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ replyCount: { decrement: 1 } }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent reply', async () => {
      prisma.forumReply.findUnique.mockResolvedValue(null);
      await expect(service.deleteForumReply('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should allow moderator to delete any reply', async () => {
      prisma.forumReply.findUnique.mockResolvedValue({ ...mockReply, authorId: 'other-user' });
      prisma.forumThread.findUnique.mockResolvedValue({ circleId: 'circle-1' });
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'MODERATOR' });
      await service.deleteForumReply('reply-1', 'user-1');
      expect(prisma.forumReply.delete).toHaveBeenCalled();
    });

    it('should reject non-author non-moderator', async () => {
      prisma.forumReply.findUnique.mockResolvedValue({ ...mockReply, authorId: 'other-user' });
      prisma.forumThread.findUnique.mockResolvedValue({ circleId: 'circle-1' });
      prisma.circleMember.findUnique.mockResolvedValueOnce({ role: 'MEMBER' });
      await expect(service.deleteForumReply('reply-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Webhook Creation ──────────────────────────────────

  describe('createWebhook', () => {
    it('should create a webhook for admin/owner', async () => {
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      const result = await service.createWebhook('user-1', 'circle-1', { name: 'Test' });
      expect(result).toEqual(mockWebhook);
    });

    it('should allow ADMIN role to create webhooks', async () => {
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'ADMIN' });
      const result = await service.createWebhook('user-1', 'circle-1', { name: 'Test' });
      expect(result).toEqual(mockWebhook);
    });

    it('should reject non-admin members from creating webhooks', async () => {
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
      await expect(service.createWebhook('user-1', 'circle-1', { name: 'Test' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should reject non-members from creating webhooks', async () => {
      prisma.circleMember.findUnique.mockResolvedValue(null);
      await expect(service.createWebhook('user-1', 'circle-1', { name: 'Test' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should reject when max webhooks reached', async () => {
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.webhook.count.mockResolvedValue(15);
      await expect(service.createWebhook('user-1', 'circle-1', { name: 'New' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ── Webhook Listing ───────────────────────────────────

  describe('getWebhooks', () => {
    it('should return only active webhooks', async () => {
      await service.getWebhooks('circle-1');
      expect(prisma.webhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { circleId: 'circle-1', isActive: true },
        }),
      );
    });

    it('should verify membership when userId is provided', async () => {
      prisma.circleMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
      await service.getWebhooks('circle-1', 'user-1');
      expect(prisma.circleMember.findUnique).toHaveBeenCalled();
      expect(prisma.webhook.findMany).toHaveBeenCalled();
    });

    it('should reject non-members when userId is provided', async () => {
      prisma.circleMember.findUnique.mockResolvedValueOnce(null);
      await expect(service.getWebhooks('circle-1', 'user-2'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ── Webhook Execution ─────────────────────────────────

  describe('executeWebhook', () => {
    it('should execute webhook with valid token', async () => {
      prisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1', isActive: true, targetChannelId: null, circleId: 'c1',
      });
      const result = await service.executeWebhook('test-token', { content: 'Hello' });
      expect(result.success).toBe(true);
    });

    it('should create message when targetChannelId exists', async () => {
      prisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1', isActive: true, targetChannelId: 'conv-1', circleId: 'c1',
      });
      await service.executeWebhook('test-token', { content: 'Bot message' });
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: 'conv-1',
            content: 'Bot message',
            messageType: 'SYSTEM',
          }),
        }),
      );
    });

    it('should reject webhook execution with invalid token', async () => {
      prisma.webhook.findUnique.mockResolvedValue(null);
      await expect(service.executeWebhook('bad-token', { content: 'Hello' }))
        .rejects.toThrow(NotFoundException);
    });

    it('should reject inactive webhook', async () => {
      prisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1', isActive: false, targetChannelId: null,
      });
      await expect(service.executeWebhook('test-token', { content: 'Hello' }))
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

    it('should update lastUsedAt on execution', async () => {
      prisma.webhook.findUnique.mockResolvedValue({
        id: 'wh-1', isActive: true, targetChannelId: null, circleId: 'c1',
      });
      await service.executeWebhook('test-token', { content: 'Hello' });
      expect(prisma.webhook.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-1' },
          data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
        }),
      );
    });
  });

  // ── Webhook Deletion ──────────────────────────────────

  describe('deleteWebhook', () => {
    it('should delete webhook by creator', async () => {
      prisma.webhook.findUnique.mockResolvedValueOnce({ id: 'wh-1', circleId: 'c1', createdById: 'user-1' });
      await service.deleteWebhook('wh-1', 'user-1');
      expect(prisma.webhook.delete).toHaveBeenCalled();
    });

    it('should allow community ADMIN to delete any webhook', async () => {
      prisma.webhook.findUnique.mockResolvedValueOnce({ id: 'wh-1', circleId: 'c1', createdById: 'other-user' });
      prisma.circleMember.findUnique.mockResolvedValueOnce({ role: 'ADMIN' });
      await service.deleteWebhook('wh-1', 'user-1');
      expect(prisma.webhook.delete).toHaveBeenCalled();
    });

    it('should allow community OWNER to delete any webhook', async () => {
      prisma.webhook.findUnique.mockResolvedValueOnce({ id: 'wh-1', circleId: 'c1', createdById: 'other-user' });
      prisma.circleMember.findUnique.mockResolvedValueOnce({ role: 'OWNER' });
      await service.deleteWebhook('wh-1', 'user-1');
      expect(prisma.webhook.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when webhook not found', async () => {
      prisma.webhook.findUnique.mockResolvedValueOnce(null);
      await expect(service.deleteWebhook('wh-1', 'user-2')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-owner non-admin', async () => {
      prisma.webhook.findUnique.mockResolvedValueOnce({ id: 'wh-1', circleId: 'c1', createdById: 'other-user' });
      prisma.circleMember.findUnique.mockResolvedValueOnce({ role: 'MEMBER' });
      await expect(service.deleteWebhook('wh-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for non-member trying to delete', async () => {
      prisma.webhook.findUnique.mockResolvedValueOnce({ id: 'wh-1', circleId: 'c1', createdById: 'other-user' });
      prisma.circleMember.findUnique.mockResolvedValueOnce(null);
      await expect(service.deleteWebhook('wh-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Stage Session Creation ────────────────────────────

  describe('createStageSession', () => {
    it('should create a stage session for a community member', async () => {
      const result = await service.createStageSession('user-1', 'circle-1', { title: 'Q&A' });
      expect(result).toEqual(mockStage);
      expect(prisma.stageSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            circleId: 'circle-1',
            hostId: 'user-1',
            speakerIds: ['user-1'],
          }),
        }),
      );
    });

    it('should reject non-members from creating stage sessions', async () => {
      prisma.circleMember.findUnique.mockResolvedValueOnce(null);
      await expect(service.createStageSession('user-2', 'circle-1', { title: 'Q&A' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should accept scheduledAt date', async () => {
      const date = '2026-04-01T10:00:00Z';
      await service.createStageSession('user-1', 'circle-1', { title: 'Q&A', scheduledAt: date });
      expect(prisma.stageSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ scheduledAt: new Date(date) }),
        }),
      );
    });
  });

  // ── Stage Session Start ───────────────────────────────

  describe('startStageSession', () => {
    it('should start a stage session by host', async () => {
      prisma.stageSession.findUnique.mockResolvedValue(mockStage);
      await service.startStageSession('stage-1', 'user-1');
      expect(prisma.stageSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'live' }) }),
      );
    });

    it('should throw NotFoundException when session not found', async () => {
      prisma.stageSession.findUnique.mockResolvedValue(null);
      await expect(service.startStageSession('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-host tries to start', async () => {
      prisma.stageSession.findUnique.mockResolvedValue(mockStage);
      await expect(service.startStageSession('stage-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });

    it('should reject starting an already ended session', async () => {
      prisma.stageSession.findUnique.mockResolvedValue({ ...mockStage, status: 'ended' });
      await expect(service.startStageSession('stage-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should reject starting an already live session', async () => {
      prisma.stageSession.findUnique.mockResolvedValue({ ...mockStage, status: 'live' });
      await expect(service.startStageSession('stage-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── Stage Session End ─────────────────────────────────

  describe('endStageSession', () => {
    it('should end a live stage session', async () => {
      prisma.stageSession.findUnique.mockResolvedValue({ ...mockStage, status: 'live' });
      await service.endStageSession('stage-1', 'user-1');
      expect(prisma.stageSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ended' }) }),
      );
    });

    it('should throw NotFoundException when session not found', async () => {
      prisma.stageSession.findUnique.mockResolvedValue(null);
      await expect(service.endStageSession('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-host tries to end', async () => {
      prisma.stageSession.findUnique.mockResolvedValue({ ...mockStage, status: 'live' });
      await expect(service.endStageSession('stage-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });

    it('should reject ending an already ended session', async () => {
      prisma.stageSession.findUnique.mockResolvedValue({ ...mockStage, status: 'ended' });
      await expect(service.endStageSession('stage-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── Stage Speaker Invite ──────────────────────────────

  describe('inviteSpeaker', () => {
    it('should invite speaker to a live stage', async () => {
      prisma.stageSession.findUnique.mockResolvedValue({ ...mockStage, status: 'live' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
      await service.inviteSpeaker('stage-1', 'user-1', 'user-2');
      expect(prisma.stageSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { speakerIds: expect.arrayContaining(['user-1', 'user-2']) },
        }),
      );
    });

    it('should throw NotFoundException when session not found', async () => {
      prisma.stageSession.findUnique.mockResolvedValue(null);
      await expect(service.inviteSpeaker('missing', 'user-1', 'user-2'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-host invites', async () => {
      prisma.stageSession.findUnique.mockResolvedValue({ ...mockStage, status: 'live' });
      await expect(service.inviteSpeaker('stage-1', 'user-3', 'user-2'))
        .rejects.toThrow(ForbiddenException);
    });

    it('should reject inviting to non-live session', async () => {
      prisma.stageSession.findUnique.mockResolvedValue({ ...mockStage, status: 'ended' });
      await expect(service.inviteSpeaker('stage-1', 'user-1', 'user-2'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent speaker', async () => {
      prisma.stageSession.findUnique.mockResolvedValue({ ...mockStage, status: 'live' });
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.inviteSpeaker('stage-1', 'user-1', 'ghost'))
        .rejects.toThrow(NotFoundException);
    });

    it('should reject when speaker cap reached', async () => {
      const fullSpeakers = Array.from({ length: 20 }, (_, i) => `speaker-${i}`);
      prisma.stageSession.findUnique.mockResolvedValue({
        ...mockStage, status: 'live', speakerIds: fullSpeakers,
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-new' });
      await expect(service.inviteSpeaker('stage-1', 'user-1', 'user-new'))
        .rejects.toThrow(BadRequestException);
    });

    it('should deduplicate speaker IDs', async () => {
      prisma.stageSession.findUnique.mockResolvedValue({ ...mockStage, status: 'live' });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      await service.inviteSpeaker('stage-1', 'user-1', 'user-1');
      expect(prisma.stageSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { speakerIds: ['user-1'] },
        }),
      );
    });
  });

  // ── Stage Speaker Remove ──────────────────────────────

  describe('removeSpeaker', () => {
    it('should remove a speaker from stage', async () => {
      prisma.stageSession.findFirst.mockResolvedValue({
        ...mockStage, speakerIds: ['user-1', 'user-2'],
      });
      await service.removeSpeaker('stage-1', 'user-1', 'user-2');
      expect(prisma.stageSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { speakerIds: ['user-1'] },
        }),
      );
    });

    it('should throw NotFoundException when session not found', async () => {
      prisma.stageSession.findFirst.mockResolvedValue(null);
      await expect(service.removeSpeaker('missing', 'user-1', 'user-2'))
        .rejects.toThrow(NotFoundException);
    });

    it('should reject removing the host', async () => {
      prisma.stageSession.findFirst.mockResolvedValue({
        ...mockStage, speakerIds: ['user-1'],
      });
      await expect(service.removeSpeaker('stage-1', 'user-1', 'user-1'))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ── Stage Join/Leave as Listener ──────────────────────

  describe('joinStageAsListener', () => {
    it('should increment audienceCount for live session', async () => {
      prisma.stageSession.findUnique.mockResolvedValue({ ...mockStage, status: 'live' });
      const result = await service.joinStageAsListener('stage-1', 'user-2');
      expect(result.success).toBe(true);
      expect(prisma.stageSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { audienceCount: { increment: 1 } },
        }),
      );
    });

    it('should throw NotFoundException when session not found', async () => {
      prisma.stageSession.findUnique.mockResolvedValue(null);
      await expect(service.joinStageAsListener('missing', 'user-2'))
        .rejects.toThrow(NotFoundException);
    });

    it('should reject joining a non-live session', async () => {
      prisma.stageSession.findUnique.mockResolvedValue(mockStage); // status: scheduled
      await expect(service.joinStageAsListener('stage-1', 'user-2'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('leaveStageAsListener', () => {
    it('should decrement audienceCount when count > 0', async () => {
      prisma.stageSession.findUnique.mockResolvedValue({ ...mockStage, audienceCount: 5 });
      const result = await service.leaveStageAsListener('stage-1', 'user-2');
      expect(result.success).toBe(true);
      expect(prisma.stageSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { audienceCount: { decrement: 1 } },
        }),
      );
    });

    it('should not decrement below zero', async () => {
      prisma.stageSession.findUnique.mockResolvedValue({ ...mockStage, audienceCount: 0 });
      const result = await service.leaveStageAsListener('stage-1', 'user-2');
      expect(result.success).toBe(true);
      expect(prisma.stageSession.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when session not found', async () => {
      prisma.stageSession.findUnique.mockResolvedValue(null);
      await expect(service.leaveStageAsListener('missing', 'user-2'))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ── Active Stage Sessions ─────────────────────────────

  describe('getActiveStageSessions', () => {
    it('should return active sessions for a specific circle', async () => {
      await service.getActiveStageSessions('circle-1');
      expect(prisma.stageSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'live', circleId: 'circle-1' }),
        }),
      );
    });

    it('should only show public community stages when no circleId', async () => {
      await service.getActiveStageSessions();
      expect(prisma.stageSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'live',
            circle: { privacy: 'PUBLIC' },
          }),
        }),
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { MessagesService } from './messages.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MessagesService — View-Once Message Security', () => {
  let service: MessagesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        MessagesService,
        {
          provide: PrismaService,
          useValue: {
            conversationMember: {
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false }),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              createMany: jest.fn(),
              delete: jest.fn(),
            },
            conversation: {
              findUnique: jest.fn().mockResolvedValue({ id: 'conv-1', slowModeSeconds: 0, disappearingDuration: null }),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            message: {
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn(),
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              delete: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            block: {
              findFirst: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
            },
            messageReaction: {
              upsert: jest.fn(),
              deleteMany: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            dMNote: {
              upsert: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
            },
            $transaction: jest.fn().mockImplementation(async (fn: unknown) => {
              if (typeof fn === 'function') return fn({
                message: { create: jest.fn().mockResolvedValue({ id: 'msg-tx', content: 'test', isViewOnce: true }) },
                conversation: { update: jest.fn(), findFirst: jest.fn() },
                conversationMember: { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findUnique: jest.fn() },
              });
              return Promise.all(fn as Promise<unknown>[]);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    prisma = module.get(PrismaService) as any;
  });

  describe('forwardMessage — view-once messages blocked', () => {
    it('should reject forwarding a view-once message', async () => {
      const viewOnceMessage = {
        id: 'msg-view-once',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'secret photo',
        messageType: 'IMAGE',
        mediaUrl: 'https://example.com/secret.jpg',
        mediaType: 'image/jpeg',
        voiceDuration: null,
        fileName: null,
        fileSize: null,
        forwardCount: 0,
        isViewOnce: true,
      };
      prisma.message.findUnique.mockResolvedValue(viewOnceMessage);

      await expect(
        service.forwardMessage('msg-view-once', 'user-1', ['conv-2']),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.forwardMessage('msg-view-once', 'user-1', ['conv-2']),
      ).rejects.toThrow('View-once messages cannot be forwarded');
    });

    it('should allow forwarding a normal (non-view-once) message', async () => {
      const normalMessage = {
        id: 'msg-normal',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'hello world',
        messageType: 'TEXT',
        mediaUrl: null,
        mediaType: null,
        voiceDuration: null,
        fileName: null,
        fileSize: null,
        forwardCount: 0,
        isViewOnce: false,
      };
      prisma.message.findUnique.mockResolvedValue(normalMessage);
      prisma.message.create.mockResolvedValue({ id: 'forwarded-msg', content: 'hello world', isForwarded: true });
      prisma.message.update.mockResolvedValue({ ...normalMessage, forwardCount: 1 });

      const result = await service.forwardMessage('msg-normal', 'user-1', ['conv-2']);

      expect(result).toHaveLength(1);
      expect(prisma.message.create).toHaveBeenCalled();
    });

    it('should reject forwarding view-once message to multiple targets', async () => {
      const viewOnceMessage = {
        id: 'msg-view-once-2',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: null,
        messageType: 'IMAGE',
        mediaUrl: 'https://example.com/secret2.jpg',
        mediaType: 'image/jpeg',
        voiceDuration: null,
        fileName: null,
        fileSize: null,
        forwardCount: 0,
        isViewOnce: true,
      };
      prisma.message.findUnique.mockResolvedValue(viewOnceMessage);

      await expect(
        service.forwardMessage('msg-view-once-2', 'user-1', ['conv-2', 'conv-3', 'conv-4']),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('markViewOnceViewed — content marked as viewed after first read', () => {
    it('should set viewedAt on first view by recipient', async () => {
      const viewOnceMsg = {
        id: 'msg-vo-1',
        conversationId: 'conv-1',
        senderId: 'user-sender',
        isViewOnce: true,
        viewedAt: null,
      };
      prisma.message.findUnique.mockResolvedValue(viewOnceMsg);
      const updatedMsg = { ...viewOnceMsg, viewedAt: new Date() };
      prisma.message.update.mockResolvedValue(updatedMsg);

      const result = await service.markViewOnceViewed('msg-vo-1', 'user-viewer');

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-vo-1' },
        data: { viewedAt: expect.any(Date) },
      });
      expect(result.viewedAt).toBeTruthy();
    });

    it('should reject second view (already viewed)', async () => {
      const alreadyViewedMsg = {
        id: 'msg-vo-2',
        conversationId: 'conv-1',
        senderId: 'user-sender',
        isViewOnce: true,
        viewedAt: new Date('2026-03-20T10:00:00Z'),
      };
      prisma.message.findUnique.mockResolvedValue(alreadyViewedMsg);

      await expect(
        service.markViewOnceViewed('msg-vo-2', 'user-viewer'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.markViewOnceViewed('msg-vo-2', 'user-viewer'),
      ).rejects.toThrow('Already viewed');
    });

    it('should reject if message is not view-once', async () => {
      const normalMsg = {
        id: 'msg-normal',
        conversationId: 'conv-1',
        senderId: 'user-sender',
        isViewOnce: false,
        viewedAt: null,
      };
      prisma.message.findUnique.mockResolvedValue(normalMsg);

      await expect(
        service.markViewOnceViewed('msg-normal', 'user-viewer'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.markViewOnceViewed('msg-normal', 'user-viewer'),
      ).rejects.toThrow('Not a view-once message');
    });

    it('should reject if sender tries to view own view-once message', async () => {
      const viewOnceMsg = {
        id: 'msg-vo-3',
        conversationId: 'conv-1',
        senderId: 'user-sender',
        isViewOnce: true,
        viewedAt: null,
      };
      prisma.message.findUnique.mockResolvedValue(viewOnceMsg);

      await expect(
        service.markViewOnceViewed('msg-vo-3', 'user-sender'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.markViewOnceViewed('msg-vo-3', 'user-sender'),
      ).rejects.toThrow('Cannot view own view-once message');
    });

    it('should throw NotFoundException if message does not exist', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.markViewOnceViewed('msg-nonexistent', 'user-viewer'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('processExpiredMessages — view-once cleanup', () => {
    it('should delete viewed view-once messages older than 30 seconds', async () => {
      prisma.message.updateMany.mockResolvedValue({ count: 2 });

      await service.processExpiredMessages();

      // First call: expired disappearing messages
      // Second call: viewed view-once messages older than 30 seconds
      expect(prisma.message.updateMany).toHaveBeenCalledTimes(2);

      const secondCall = prisma.message.updateMany.mock.calls[1];
      expect(secondCall[0].where).toEqual({
        isViewOnce: true,
        viewedAt: { lt: expect.any(Date) },
        isDeleted: false,
      });
      expect(secondCall[0].data).toEqual({
        isDeleted: true,
        content: null,
        mediaUrl: null,
      });
    });
  });
});

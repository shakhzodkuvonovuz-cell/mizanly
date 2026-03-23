import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { MessagesService } from './messages.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MessagesService — edge cases', () => {
  let service: MessagesService;
  let prisma: any;

  const userId = 'user-edge-1';
  const convId = 'conv-1';

  const mockMembership = { userId, isMuted: false, isArchived: false, isBanned: false, unreadCount: 0 };
  const mockMessage = {
    id: 'msg-1',
    conversationId: convId,
    senderId: userId,
    content: 'test',
    messageType: 'TEXT',
    mediaUrl: null,
    mediaType: null,
    voiceDuration: null,
    fileName: null,
    fileSize: null,
    replyToId: null,
    isForwarded: false,
    isDeleted: false,
    editedAt: null,
    transcription: null,
    createdAt: new Date(),
    sender: { id: userId, username: 'testuser', displayName: 'Test', avatarUrl: null },
    replyTo: null,
    reactions: [],
    forwardCount: 0,
  };

  beforeEach(async () => {
    const txPrisma = {
      message: { create: jest.fn().mockResolvedValue(mockMessage) },
      conversation: { update: jest.fn(), findFirst: jest.fn() },
      conversationMember: { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        MessagesService,
        {
          provide: PrismaService,
          useValue: {
            conversationMember: {
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue(mockMembership),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              createMany: jest.fn(),
              delete: jest.fn(),
            },
            conversation: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            message: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            block: { findFirst: jest.fn() },
            messageReaction: { upsert: jest.fn(), deleteMany: jest.fn() },
            user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            dMNote: { upsert: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            $transaction: jest.fn().mockImplementation(async (fn: unknown) => {
              if (typeof fn === 'function') return fn(txPrisma);
              return Promise.all(fn as Promise<unknown>[]);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    prisma = module.get(PrismaService);
  });

  describe('sendMessage — input edge cases', () => {
    it('should handle Arabic message content', async () => {
      const arabicMessage = 'السلام عليكم ورحمة الله وبركاته';

      const result = await service.sendMessage(convId, userId, {
        content: arabicMessage,
      });

      expect(result).toBeDefined();
      // The $transaction callback should have been called
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should handle emoji-only message', async () => {
      const result = await service.sendMessage(convId, userId, {
        content: '🤲🕌📿🌙',
      });

      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException when content and media are both empty', async () => {
      await expect(service.sendMessage(convId, userId, {}))
        .rejects.toThrow(BadRequestException);
    });

    it('should handle content with null bytes without crashing', async () => {
      const result = await service.sendMessage(convId, userId, {
        content: 'hello\x00world',
      });

      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should accept message with only mediaUrl (no content)', async () => {
      const result = await service.sendMessage(convId, userId, {
        mediaUrl: 'https://example.com/image.jpg',
        mediaType: 'image/jpeg',
      });

      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('forwardMessage — edge cases', () => {
    it('should throw BadRequestException when targetConversationIds is empty', async () => {
      await expect(service.forwardMessage('msg-1', userId, []))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when forwarding to more than 5 targets', async () => {
      const targets = ['conv-1', 'conv-2', 'conv-3', 'conv-4', 'conv-5', 'conv-6'];

      await expect(service.forwardMessage('msg-1', userId, targets))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('editMessage — edge cases', () => {
    it('should handle RTL override characters in edited content without crash', async () => {
      const msg = {
        ...mockMessage,
        createdAt: new Date(), // recent, within 15 min
      };
      prisma.message.findUnique.mockResolvedValue(msg);
      prisma.message.update.mockResolvedValue({ ...msg, content: '\u202E\u202D mixed direction', editedAt: new Date() });

      const result = await service.editMessage('msg-1', userId, '\u202E\u202D mixed direction');
      expect(result).toHaveProperty('message');
      expect(result.message).toHaveProperty('editedAt');
    });

    it('should throw BadRequestException for editing deleted message', async () => {
      prisma.message.findUnique.mockResolvedValue({ ...mockMessage, isDeleted: true });

      await expect(service.editMessage('msg-1', userId, 'updated'))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when editing message older than 15 minutes', async () => {
      const oldMessage = {
        ...mockMessage,
        createdAt: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago
      };
      prisma.message.findUnique.mockResolvedValue(oldMessage);

      await expect(service.editMessage('msg-1', userId, 'updated'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('reactToMessage — edge cases', () => {
    it('should handle multi-codepoint family emoji', async () => {
      prisma.message.findUnique.mockResolvedValue(mockMessage);
      prisma.messageReaction.upsert.mockResolvedValue({ id: 'react-1' });

      const familyEmoji = '👨‍👩‍👧‍👦';
      const result = await service.reactToMessage('msg-1', userId, familyEmoji);
      expect(result.reacted).toBe(true);
      expect(prisma.messageReaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ emoji: familyEmoji }),
        }),
      );
    });
  });
});

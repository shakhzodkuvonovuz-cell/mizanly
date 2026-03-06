import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { MessagesService } from './messages.service';

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        {
          provide: PrismaService,
          useValue: {
            conversationMember: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
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
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    prisma = module.get(PrismaService) as any;
  });

  describe('getConversations', () => {
    it('should return conversations with membership info', async () => {
      const userId = 'user-123';
      const mockMemberships = [
        {
          conversation: {
            id: 'conv-1',
            isGroup: false,
            groupName: null,
            groupAvatarUrl: null,
            lastMessageText: 'Hello',
            lastMessageAt: new Date(),
            createdAt: new Date(),
            members: [
              {
                user: {
                  id: 'user-456',
                  username: 'otheruser',
                  displayName: 'Other User',
                  avatarUrl: 'https://example.com/avatar.jpg',
                  isVerified: false,
                },
              },
            ],
          },
          isMuted: false,
          isArchived: false,
          unreadCount: 5,
          lastReadAt: new Date(),
        },
      ];
      prisma.conversationMember.findMany.mockResolvedValue(mockMemberships);

      const result = await service.getConversations(userId);

      expect(prisma.conversationMember.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: {
          conversation: { select: expect.any(Object) },
        },
        orderBy: { conversation: { lastMessageAt: 'desc' } },
      });
      expect(result).toEqual([
        {
          ...mockMemberships[0].conversation,
          isMuted: false,
          isArchived: false,
          unreadCount: 5,
          lastReadAt: mockMemberships[0].lastReadAt,
        },
      ]);
    });
  });

  describe('getConversation', () => {
    it('should return conversation if user is member', async () => {
      const conversationId = 'conv-1';
      const userId = 'user-123';
      const mockConversation = {
        id: conversationId,
        isGroup: false,
        groupName: null,
        lastMessageText: 'Hello',
        lastMessageAt: new Date(),
        createdAt: new Date(),
        members: [],
      };
      // Mock requireMembership (private method) - we'll need to spy
      // For simplicity, we'll mock prisma.conversation.findUnique
      const requireMembershipSpy = jest.spyOn(service as any, 'requireMembership').mockResolvedValue(undefined);
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);

      const result = await service.getConversation(conversationId, userId);

      expect(requireMembershipSpy).toHaveBeenCalledWith(conversationId, userId);
      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: conversationId },
        select: expect.any(Object),
      });
      expect(result).toEqual(mockConversation);
    });

    it('should throw NotFoundException if conversation not found', async () => {
      const conversationId = 'conv-1';
      const userId = 'user-123';
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue(undefined);
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.getConversation(conversationId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMessages', () => {
    it('should return messages with pagination', async () => {
      const conversationId = 'conv-1';
      const userId = 'user-123';
      const cursor = 'msg-10';
      const limit = 20;
      const mockMessages = [
        {
          id: 'msg-11',
          content: 'Test message',
          messageType: 'TEXT',
          createdAt: new Date(),
          sender: {
            id: userId,
            username: 'user123',
            displayName: 'User 123',
            avatarUrl: null,
          },
        },
      ];
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue(undefined);
      prisma.message.findMany.mockResolvedValue(mockMessages);

      const result = await service.getMessages(conversationId, userId, cursor, limit);

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId, isDeleted: false },
        select: expect.any(Object),
        take: limit + 1,
        cursor: { id: cursor },
        skip: 1,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual({
        data: mockMessages.slice(0, limit),
        meta: { cursor: null, hasMore: false },
      });
    });
  });

  describe('sendMessage', () => {
    it('should create message and update conversation lastMessage', async () => {
      const conversationId = 'conv-1';
      const userId = 'user-123';
      const content = 'Hello world';
      const messageType = 'TEXT';
      const mockMessage = {
        id: 'msg-999',
        content,
        messageType,
        createdAt: new Date(),
        sender: { id: userId },
      };
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue(undefined);
      prisma.message.create.mockResolvedValue(mockMessage);
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.sendMessage(conversationId, userId, { content, messageType });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId,
          senderId: userId,
          content,
          messageType,
        }),
        select: expect.any(Object),
      });
      expect(result).toEqual(mockMessage);
    });
  });

  describe('deleteMessage', () => {
    it('should soft-delete message if user is sender', async () => {
      const messageId = 'msg-123';
      const userId = 'user-123';
      const mockMessage = {
        id: messageId,
        senderId: userId,
        isDeleted: false,
      };
      prisma.message.findUnique.mockResolvedValue(mockMessage);
      prisma.message.update.mockResolvedValue({ ...mockMessage, isDeleted: true });

      const result = await service.deleteMessage(messageId, userId);

      expect(prisma.message.findUnique).toHaveBeenCalledWith({ where: { id: messageId } });
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: messageId },
        data: { isDeleted: true, content: null },
      });
      expect(result).toEqual({ deleted: true });
    });

    it('should throw ForbiddenException if user is not sender', async () => {
      const messageId = 'msg-123';
      const userId = 'user-123';
      const mockMessage = {
        id: messageId,
        senderId: 'different-user',
        isDeleted: false,
      };
      prisma.message.findUnique.mockResolvedValue(mockMessage);

      await expect(service.deleteMessage(messageId, userId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('markRead', () => {
    it('should update lastReadAt and reset unreadCount', async () => {
      const conversationId = 'conv-1';
      const userId = 'user-123';
      const mockMembership = {
        userId,
        conversationId,
        unreadCount: 5,
        lastReadAt: new Date('2024-01-01'),
      };
      prisma.conversationMember.findUnique.mockResolvedValue(mockMembership);
      prisma.conversationMember.update.mockResolvedValue({
        ...mockMembership,
        unreadCount: 0,
        lastReadAt: new Date(),
      });

      const result = await service.markRead(conversationId, userId);

      expect(prisma.conversationMember.findUnique).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId, userId } },
      });
      expect(prisma.conversationMember.update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId, userId } },
        data: { unreadCount: 0, lastReadAt: expect.any(Date) },
      });
      expect(result).toEqual({ read: true });
    });
  });

  // Additional tests for editMessage, createDM, createGroup, addGroupMembers, leaveGroup, muteConversation, archiveConversation, reactToMessage, removeReaction
});
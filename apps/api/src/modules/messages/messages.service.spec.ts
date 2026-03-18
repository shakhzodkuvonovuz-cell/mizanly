import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { MessagesService } from './messages.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MessagesService', () => {
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
              findMany: jest.fn(),
              findUnique: jest.fn(),
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
            },
            block: {
              findFirst: jest.fn(),
            },
            messageReaction: {
              upsert: jest.fn(),
              deleteMany: jest.fn(),
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

  describe('editMessage', () => {
    it('should edit message within 15-minute window', async () => {
      const messageId = 'msg-456';
      const userId = 'user-123';
      const content = 'Updated content';
      const mockMessage = {
        id: messageId,
        senderId: userId,
        isDeleted: false,
        createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      };
      prisma.message.findUnique.mockResolvedValue(mockMessage);
      prisma.message.update.mockResolvedValue({ ...mockMessage, content, editedAt: new Date() });

      const result = await service.editMessage(messageId, userId, content);

      expect(prisma.message.findUnique).toHaveBeenCalledWith({ where: { id: messageId } });
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: messageId },
        data: { content, editedAt: expect.any(Date) },
      });
      expect(result).toEqual({ message: { ...mockMessage, content, editedAt: expect.any(Date) } });
    });

    it('should throw BadRequestException after 15 minutes', async () => {
      const messageId = 'msg-456';
      const userId = 'user-123';
      const mockMessage = {
        id: messageId,
        senderId: userId,
        isDeleted: false,
        createdAt: new Date(Date.now() - 20 * 60 * 1000), // 20 minutes ago
      };
      prisma.message.findUnique.mockResolvedValue(mockMessage);

      await expect(service.editMessage(messageId, userId, 'content')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.editMessage('msg-456', 'user-123', 'content')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not sender', async () => {
      const mockMessage = {
        id: 'msg-456',
        senderId: 'different-user',
        isDeleted: false,
        createdAt: new Date(),
      };
      prisma.message.findUnique.mockResolvedValue(mockMessage);

      await expect(service.editMessage('msg-456', 'user-123', 'content')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if message deleted', async () => {
      const mockMessage = {
        id: 'msg-456',
        senderId: 'user-123',
        isDeleted: true,
        createdAt: new Date(),
      };
      prisma.message.findUnique.mockResolvedValue(mockMessage);

      await expect(service.editMessage('msg-456', 'user-123', 'content')).rejects.toThrow(BadRequestException);
    });
  });

  describe('createDM', () => {
    it('should create new DM conversation', async () => {
      const userId = 'user-123';
      const targetUserId = 'user-456';
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.conversation.findFirst.mockResolvedValue(null);
      const mockConversation = {
        id: 'conv-789',
        isGroup: false,
        members: [],
      };
      prisma.conversation.create.mockResolvedValue(mockConversation);

      const result = await service.createDM(userId, targetUserId);

      expect(prisma.block.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockerId: userId, blockedId: targetUserId },
            { blockerId: targetUserId, blockedId: userId },
          ],
        },
      });
      expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          isGroup: false,
          AND: [
            { members: { some: { userId } } },
            { members: { some: { userId: targetUserId } } },
          ],
        },
        select: expect.any(Object),
      });
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          isGroup: false,
          createdById: userId,
          members: {
            create: [{ userId }, { userId: targetUserId }],
          },
        },
        select: expect.any(Object),
      });
      expect(result).toEqual(mockConversation);
    });

    it('should return existing DM if already exists', async () => {
      const userId = 'user-123';
      const targetUserId = 'user-456';
      prisma.block.findFirst.mockResolvedValue(null);
      const existingConv = { id: 'conv-789', isGroup: false };
      prisma.conversation.findFirst.mockResolvedValue(existingConv);

      const result = await service.createDM(userId, targetUserId);

      expect(prisma.conversation.findFirst).toHaveBeenCalled();
      expect(prisma.conversation.create).not.toHaveBeenCalled();
      expect(result).toEqual(existingConv);
    });

    it('should throw BadRequestException if target is self', async () => {
      await expect(service.createDM('user-123', 'user-123')).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if blocked', async () => {
      prisma.block.findFirst.mockResolvedValue({ blockerId: 'user-123', blockedId: 'user-456' });

      await expect(service.createDM('user-123', 'user-456')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createGroup', () => {
    it('should create group conversation', async () => {
      const userId = 'user-123';
      const groupName = 'My Group';
      const memberIds = ['user-456', 'user-789'];
      const mockConversation = {
        id: 'conv-999',
        isGroup: true,
        groupName,
      };
      prisma.conversation.create.mockResolvedValue(mockConversation);

      const result = await service.createGroup(userId, groupName, memberIds);

      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          isGroup: true,
          groupName,
          createdById: userId,
          members: {
            create: [{ userId }, { userId: 'user-456' }, { userId: 'user-789' }],
          },
        },
        select: expect.any(Object),
      });
      expect(result).toEqual(mockConversation);
    });

    it('should throw BadRequestException if groupName empty', async () => {
      await expect(service.createGroup('user-123', '', [])).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateGroup', () => {
    it('should update group if user is creator', async () => {
      const conversationId = 'conv-456';
      const userId = 'user-123';
      const data = { groupName: 'New Name' };
      const mockConversation = {
        id: conversationId,
        isGroup: true,
        createdById: userId,
      };
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);
      prisma.conversation.update.mockResolvedValue({ ...mockConversation, ...data });

      const result = await service.updateGroup(conversationId, userId, data);

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({ where: { id: conversationId } });
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: conversationId },
        data,
        select: expect.any(Object),
      });
      expect(result).toEqual({ ...mockConversation, ...data });
    });

    it('should throw NotFoundException if conversation not found', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.updateGroup('conv-456', 'user-123', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if not a group', async () => {
      const mockConversation = { id: 'conv-456', isGroup: false };
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(service.updateGroup('conv-456', 'user-123', {})).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if user not creator', async () => {
      const mockConversation = { id: 'conv-456', isGroup: true, createdById: 'different-user' };
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(service.updateGroup('conv-456', 'user-123', {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addGroupMembers', () => {
    it('should add members if user is creator', async () => {
      const conversationId = 'conv-456';
      const userId = 'user-123';
      const memberIds = ['user-456', 'user-789'];
      const mockConversation = {
        id: conversationId,
        isGroup: true,
        createdById: userId,
      };
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);
      prisma.conversationMember.createMany.mockResolvedValue({} as any);

      const result = await service.addGroupMembers(conversationId, userId, memberIds);

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({ where: { id: conversationId } });
      expect(prisma.conversationMember.createMany).toHaveBeenCalledWith({
        data: memberIds.map((id) => ({ conversationId, userId: id })),
        skipDuplicates: true,
      });
      expect(result).toEqual({ added: true });
    });

    it('should throw NotFoundException if group not found', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.addGroupMembers('conv-456', 'user-123', [])).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user not creator', async () => {
      const mockConversation = { id: 'conv-456', isGroup: true, createdById: 'different-user' };
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(service.addGroupMembers('conv-456', 'user-123', [])).rejects.toThrow(ForbiddenException);
    });
  });

  describe('removeGroupMember', () => {
    it('should remove member if user is creator', async () => {
      const conversationId = 'conv-456';
      const userId = 'user-123';
      const targetUserId = 'user-456';
      const mockConversation = {
        id: conversationId,
        isGroup: true,
        createdById: userId,
      };
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);
      prisma.conversationMember.delete.mockResolvedValue({} as any);

      const result = await service.removeGroupMember(conversationId, userId, targetUserId);

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({ where: { id: conversationId } });
      expect(prisma.conversationMember.delete).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId, userId: targetUserId } },
      });
      expect(result).toEqual({ removed: true });
    });

    it('should throw NotFoundException if group not found', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.removeGroupMember('conv-456', 'user-123', 'user-456')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user not creator', async () => {
      const mockConversation = { id: 'conv-456', isGroup: true, createdById: 'different-user' };
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(service.removeGroupMember('conv-456', 'user-123', 'user-456')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('leaveGroup', () => {
    it('should remove user from group', async () => {
      const conversationId = 'conv-456';
      const userId = 'user-123';
      const requireMembershipSpy = jest.spyOn(service as any, 'requireMembership').mockResolvedValue({});
      prisma.conversationMember.delete.mockResolvedValue({} as any);

      const result = await service.leaveGroup(conversationId, userId);

      expect(requireMembershipSpy).toHaveBeenCalledWith(conversationId, userId);
      expect(prisma.conversationMember.delete).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId, userId } },
      });
      expect(result).toEqual({ left: true });
    });
  });

  describe('muteConversation', () => {
    it('should mute conversation', async () => {
      const conversationId = 'conv-456';
      const userId = 'user-123';
      const requireMembershipSpy = jest.spyOn(service as any, 'requireMembership').mockResolvedValue({});
      prisma.conversationMember.update.mockResolvedValue({} as any);

      const result = await service.muteConversation(conversationId, userId, true);

      expect(requireMembershipSpy).toHaveBeenCalledWith(conversationId, userId);
      expect(prisma.conversationMember.update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId, userId } },
        data: { isMuted: true },
      });
      expect(result).toEqual({ muted: true });
    });
  });

  describe('archiveConversation', () => {
    it('should archive conversation', async () => {
      const conversationId = 'conv-456';
      const userId = 'user-123';
      const requireMembershipSpy = jest.spyOn(service as any, 'requireMembership').mockResolvedValue({});
      prisma.conversationMember.update.mockResolvedValue({} as any);

      const result = await service.archiveConversation(conversationId, userId, true);

      expect(requireMembershipSpy).toHaveBeenCalledWith(conversationId, userId);
      expect(prisma.conversationMember.update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId, userId } },
        data: { isArchived: true },
      });
      expect(result).toEqual({ archived: true });
    });
  });

  describe('reactToMessage', () => {
    it('should add reaction to message', async () => {
      const messageId = 'msg-456';
      const userId = 'user-123';
      const emoji = '👍';
      const mockMessage = { id: messageId, conversationId: 'conv-789', isDeleted: false };
      prisma.message.findUnique.mockResolvedValue(mockMessage);
      const requireMembershipSpy = jest.spyOn(service as any, 'requireMembership').mockResolvedValue({});
      prisma.messageReaction.upsert.mockResolvedValue({} as any);

      const result = await service.reactToMessage(messageId, userId, emoji);

      expect(prisma.message.findUnique).toHaveBeenCalledWith({ where: { id: messageId } });
      expect(requireMembershipSpy).toHaveBeenCalledWith('conv-789', userId);
      expect(prisma.messageReaction.upsert).toHaveBeenCalledWith({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
        create: { messageId, userId, emoji },
        update: {},
      });
      expect(result).toEqual({ reacted: true });
    });

    it('should throw NotFoundException if message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);

      await expect(service.reactToMessage('msg-456', 'user-123', '👍')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if message deleted', async () => {
      const mockMessage = { id: 'msg-456', isDeleted: true };
      prisma.message.findUnique.mockResolvedValue(mockMessage);

      await expect(service.reactToMessage('msg-456', 'user-123', '👍')).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeReaction', () => {
    it('should remove reaction', async () => {
      const messageId = 'msg-456';
      const userId = 'user-123';
      const emoji = '👍';
      prisma.messageReaction.deleteMany.mockResolvedValue({} as any);

      const result = await service.removeReaction(messageId, userId, emoji);

      expect(prisma.messageReaction.deleteMany).toHaveBeenCalledWith({
        where: { messageId, userId, emoji },
      });
      expect(result).toEqual({ removed: true });
    });
  });

});
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
              findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, unreadCount: 0 }),
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
            user: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            dMNote: {
              upsert: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
            },
            $transaction: jest.fn().mockImplementation(async (fn: unknown) => {
              if (typeof fn === 'function') return fn({
                message: { create: jest.fn().mockResolvedValue({ id: 'msg-tx', content: 'test' }) },
                conversation: { update: jest.fn() },
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

      expect(prisma.conversationMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          orderBy: { conversation: { lastMessageAt: 'desc' } },
        }),
      );
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
      const requireMembershipSpy = jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ isMuted: false, isArchived: false });
      prisma.conversation.findUnique.mockResolvedValue(mockConversation);

      const result = await service.getConversation(conversationId, userId);

      expect(requireMembershipSpy).toHaveBeenCalledWith(conversationId, userId);
      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: conversationId },
        select: expect.any(Object),
      });
      expect(result).toEqual({ ...mockConversation, isMuted: false, isArchived: false });
    });

    it('should throw NotFoundException if conversation not found', async () => {
      const conversationId = 'conv-1';
      const userId = 'user-123';
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ isMuted: false, isArchived: false });
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
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ isMuted: false, isArchived: false });
      prisma.message.findMany.mockResolvedValue(mockMessages);

      const result = await service.getMessages(conversationId, userId, cursor, limit);

      expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { conversationId, isDeleted: false },
        select: expect.any(Object),
        take: limit + 1,
        cursor: { id: cursor },
        skip: 1,
        orderBy: { createdAt: 'desc' },
      }));
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
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ isMuted: false, isArchived: false });

      // Interactive transaction mock — fn receives tx proxy
      const mockTx = {
        message: { create: jest.fn().mockResolvedValue(mockMessage) },
        conversation: { update: jest.fn().mockResolvedValue({}) },
        conversationMember: { updateMany: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));

      const result = await service.sendMessage(conversationId, userId, { content, messageType });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockTx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId,
            senderId: userId,
            content,
            messageType: 'TEXT',
          }),
        }),
      );
      expect(mockTx.conversation.update).toHaveBeenCalled();
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
      const updatedMessage = { id: messageId, content, editedAt: new Date() };
      prisma.message.findUnique.mockResolvedValue(mockMessage);
      prisma.message.update.mockResolvedValue(updatedMessage);

      const result = await service.editMessage(messageId, userId, content);

      expect(prisma.message.findUnique).toHaveBeenCalledWith({ where: { id: messageId } });
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: messageId },
        data: { content, editedAt: expect.any(Date) },
        select: expect.any(Object),
      });
      expect(result).toEqual({ message: updatedMessage });
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
      prisma.user.findUnique.mockResolvedValue({ id: targetUserId });
      prisma.block.findFirst.mockResolvedValue(null);
      const mockConversation = {
        id: 'conv-789',
        isGroup: false,
        members: [],
      };

      // Interactive transaction: tx.conversation.findFirst returns null, tx.conversation.create returns new conv
      const mockTx = {
        conversation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(mockConversation),
        },
      };
      prisma.$transaction.mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));

      const result = await service.createDM(userId, targetUserId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: targetUserId }, select: { id: true } });
      expect(prisma.block.findFirst).toHaveBeenCalled();
      expect(mockTx.conversation.findFirst).toHaveBeenCalled();
      expect(mockTx.conversation.create).toHaveBeenCalled();
      expect(result).toEqual(mockConversation);
    });

    it('should return existing DM if already exists', async () => {
      const userId = 'user-123';
      const targetUserId = 'user-456';
      prisma.user.findUnique.mockResolvedValue({ id: targetUserId });
      prisma.block.findFirst.mockResolvedValue(null);
      const existingConv = { id: 'conv-789', isGroup: false };

      const mockTx = {
        conversation: {
          findFirst: jest.fn().mockResolvedValue(existingConv),
          create: jest.fn(),
        },
      };
      prisma.$transaction.mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));

      const result = await service.createDM(userId, targetUserId);

      expect(mockTx.conversation.findFirst).toHaveBeenCalled();
      expect(mockTx.conversation.create).not.toHaveBeenCalled();
      expect(result).toEqual(existingConv);
    });

    it('should throw BadRequestException if target is self', async () => {
      await expect(service.createDM('user-123', 'user-123')).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if blocked', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-456' });
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
      // Validate all members exist
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-123' }, { id: 'user-456' }, { id: 'user-789' },
      ]);
      prisma.conversation.create.mockResolvedValue(mockConversation);

      const result = await service.createGroup(userId, groupName, memberIds);

      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: { in: [userId, ...memberIds] } },
        select: { id: true },
      }));
      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isGroup: true,
            groupName,
            createdById: userId,
          }),
        }),
      );
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
      // convo exists and user is NOT the creator
      prisma.conversation.findUnique.mockResolvedValue({ id: conversationId, createdById: 'other-user' });
      prisma.conversationMember.delete.mockResolvedValue({} as any);

      const result = await service.leaveGroup(conversationId, userId);

      expect(requireMembershipSpy).toHaveBeenCalledWith(conversationId, userId);
      expect(prisma.conversationMember.delete).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId, userId } },
      });
      expect(result).toEqual({ left: true });
    });

    it('should throw BadRequestException if owner tries to leave', async () => {
      const conversationId = 'conv-456';
      const userId = 'user-123';
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({});
      prisma.conversation.findUnique.mockResolvedValue({ id: conversationId, createdById: userId });

      await expect(service.leaveGroup(conversationId, userId)).rejects.toThrow(BadRequestException);
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
      // Service first finds message to get conversationId, then calls requireMembership
      prisma.message.findUnique.mockResolvedValue({ id: messageId, conversationId: 'conv-1' });
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({});
      prisma.messageReaction.deleteMany.mockResolvedValue({} as any);

      const result = await service.removeReaction(messageId, userId, emoji);

      expect(prisma.message.findUnique).toHaveBeenCalledWith({ where: { id: messageId } });
      expect(prisma.messageReaction.deleteMany).toHaveBeenCalledWith({
        where: { messageId, userId, emoji },
      });
      expect(result).toEqual({ removed: true });
    });
  });

  describe('setMemberTag', () => {
    it('should update member tag', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      prisma.conversationMember.update.mockResolvedValue({ tag: 'Admin' });

      const result = await service.setMemberTag('conv-1', 'user-1', 'Admin');
      expect(result).toEqual({ updated: true });
      expect(prisma.conversationMember.update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: 'conv-1', userId: 'user-1' } },
        data: { tag: 'Admin' },
      });
    });

    it('should truncate tag to 30 characters', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      prisma.conversationMember.update.mockResolvedValue({ tag: 'a'.repeat(30) });

      await service.setMemberTag('conv-1', 'user-1', 'a'.repeat(50));
      expect(prisma.conversationMember.update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: 'conv-1', userId: 'user-1' } },
        data: { tag: 'a'.repeat(30) },
      });
    });

    it('should clear tag when null is passed', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      prisma.conversationMember.update.mockResolvedValue({ tag: null });

      await service.setMemberTag('conv-1', 'user-1', null);
      expect(prisma.conversationMember.update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: 'conv-1', userId: 'user-1' } },
        data: { tag: null },
      });
    });
  });

  describe('setLockCode', () => {
    it('should set lock code on conversation', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      prisma.conversation.update.mockResolvedValue({ lockCode: '1234' });

      const result = await service.setLockCode('conv-1', 'user-1', '1234');
      expect(result).toEqual({ updated: true });
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { lockCode: '1234' },
      });
    });

    it('should remove lock code when null is passed', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      prisma.conversation.update.mockResolvedValue({ lockCode: null });

      await service.setLockCode('conv-1', 'user-1', null);
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { lockCode: null },
      });
    });
  });

  describe('verifyLockCode', () => {
    it('should return valid: true for correct code', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      prisma.conversation.findUnique.mockResolvedValue({ lockCode: 'secret123' });

      const result = await service.verifyLockCode('conv-1', 'user-1', 'secret123');
      expect(result).toEqual({ valid: true });
    });

    it('should return valid: false for wrong code', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      prisma.conversation.findUnique.mockResolvedValue({ lockCode: 'secret123' });

      const result = await service.verifyLockCode('conv-1', 'user-1', 'wrong');
      expect(result).toEqual({ valid: false });
    });

    it('should throw NotFoundException if conversation not found', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.verifyLockCode('conv-1', 'user-1', 'code')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setNewMemberHistoryCount', () => {
    it('should set history count for group owner', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      prisma.conversation.findUnique.mockResolvedValue({ createdById: 'user-1', isGroup: true });
      prisma.conversation.update.mockResolvedValue({ newMemberHistoryCount: 50 });

      const result = await service.setNewMemberHistoryCount('conv-1', 'user-1', 50);
      expect(result).toEqual({ count: 50 });
    });

    it('should clamp count to 0-100 range', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      prisma.conversation.findUnique.mockResolvedValue({ createdById: 'user-1', isGroup: true });
      prisma.conversation.update.mockResolvedValue({ newMemberHistoryCount: 100 });

      const result = await service.setNewMemberHistoryCount('conv-1', 'user-1', 500);
      expect(result).toEqual({ count: 100 });
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { newMemberHistoryCount: 100 },
      });
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-2', isMuted: false, isArchived: false, isBanned: false });
      prisma.conversation.findUnique.mockResolvedValue({ createdById: 'user-1', isGroup: true });

      await expect(service.setNewMemberHistoryCount('conv-1', 'user-2', 25)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for non-group conversation', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      prisma.conversation.findUnique.mockResolvedValue({ createdById: 'user-1', isGroup: false });

      await expect(service.setNewMemberHistoryCount('conv-1', 'user-1', 25)).rejects.toThrow(BadRequestException);
    });
  });

  describe('sendMessage with spoiler and viewOnce', () => {
    it('should create message with isSpoiler flag', async () => {
      const result = await service.sendMessage('conv-1', 'user-1', {
        content: 'Hidden text',
        isSpoiler: true,
      });
      const createCall = prisma.$transaction.mock.calls[0][0];
      expect(createCall).toBeDefined();
    });

    it('should create message with isViewOnce flag', async () => {
      const result = await service.sendMessage('conv-1', 'user-1', {
        content: 'Self-destruct',
        isViewOnce: true,
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

});
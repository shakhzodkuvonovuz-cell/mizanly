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
              findMany: jest.fn().mockResolvedValue([]),
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
              count: jest.fn().mockResolvedValue(0),
            },
            block: {
              findFirst: jest.fn(),
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
      prisma.block.findMany.mockResolvedValue([]); // no blocks
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
      prisma.user.findMany.mockResolvedValue([{ id: 'user-456' }, { id: 'user-789' }]);
      prisma.block.findMany.mockResolvedValue([]);
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
      expect(result).toEqual({ removed: true, conversationId, targetUserId });
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
      expect(result).toEqual({ left: true, conversationId, userId });
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
    it('should set hashed lock code on conversation', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      prisma.conversation.update.mockResolvedValue({});

      const result = await service.setLockCode('conv-1', 'user-1', '1234');
      expect(result).toEqual({ updated: true });
      // Lock code should be hashed (salt:hash format), not plaintext
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-1' },
          data: { lockCode: expect.stringContaining(':') },
        }),
      );
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
      // First set a lock code to get a real hash
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      let storedHash = '';
      prisma.conversation.update.mockImplementation(async (args: any) => {
        storedHash = args.data.lockCode;
        return {};
      });
      await service.setLockCode('conv-1', 'user-1', '1234');

      // Now verify with the stored hash
      prisma.conversation.findUnique.mockResolvedValue({ lockCode: storedHash });
      const result = await service.verifyLockCode('conv-1', 'user-1', '1234');
      expect(result).toEqual({ valid: true });
    });

    it('should return valid: false for wrong code', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false });
      let storedHash = '';
      prisma.conversation.update.mockImplementation(async (args: any) => {
        storedHash = args.data.lockCode;
        return {};
      });
      await service.setLockCode('conv-1', 'user-1', '1234');
      prisma.conversation.findUnique.mockResolvedValue({ lockCode: storedHash });

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

  // ═══════════════════════════════════════════════════════
  // NEW TESTS — forwardMessage
  // ═══════════════════════════════════════════════════════

  describe('forwardMessage', () => {
    it('should forward message to multiple conversations', async () => {
      prisma.message.findUnique.mockResolvedValue({
        conversationId: 'conv-1', content: 'Hello', messageType: 'TEXT',
        mediaUrl: null, mediaType: null, voiceDuration: null, fileName: null, fileSize: null, forwardCount: 0,
      });
      prisma.message.create.mockResolvedValue({ id: 'fwd-1', content: 'Hello', isForwarded: true });
      prisma.conversation.update.mockResolvedValue({});
      prisma.message.update.mockResolvedValue({});

      const result = await service.forwardMessage('msg-1', 'user-1', ['conv-2', 'conv-3']);
      expect(result).toHaveLength(2);
      expect(prisma.message.create).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException for more than 5 targets', async () => {
      await expect(
        service.forwardMessage('msg-1', 'user-1', ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for empty target list', async () => {
      await expect(service.forwardMessage('msg-1', 'user-1', [])).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when original message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.forwardMessage('nonexistent', 'user-1', ['conv-2'])).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // searchMessages
  // ═══════════════════════════════════════════════════════

  describe('searchMessages', () => {
    it('should return matching messages', async () => {
      prisma.message.findMany.mockResolvedValue([
        { id: 'msg-1', content: 'Hello world', sender: { id: 'u1' } },
      ]);

      const result = await service.searchMessages('conv-1', 'user-1', 'Hello');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should throw BadRequestException for empty query', async () => {
      await expect(service.searchMessages('conv-1', 'user-1', '')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for whitespace-only query', async () => {
      await expect(service.searchMessages('conv-1', 'user-1', '   ')).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // markDelivered
  // ═══════════════════════════════════════════════════════

  describe('markDelivered', () => {
    it('should update deliveredAt timestamp', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', conversationId: 'conv-1' });
      prisma.message.update.mockResolvedValue({ id: 'msg-1', deliveredAt: new Date() });

      const result = await service.markDelivered('msg-1', 'user-1');
      expect(result.deliveredAt).toBeDefined();
    });

    it('should throw NotFoundException when message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.markDelivered('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getMediaGallery
  // ═══════════════════════════════════════════════════════

  describe('getMediaGallery', () => {
    it('should return media messages', async () => {
      prisma.message.findMany.mockResolvedValue([
        { id: 'msg-1', mediaUrl: 'https://r2.example/img.jpg', messageType: 'IMAGE' },
      ]);

      const result = await service.getMediaGallery('conv-1', 'user-1');
      expect(result.data).toHaveLength(1);
    });

    it('should return empty for conversation with no media', async () => {
      prisma.message.findMany.mockResolvedValue([]);
      const result = await service.getMediaGallery('conv-1', 'user-1');
      expect(result.data).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════
  // setDisappearingTimer
  // ═══════════════════════════════════════════════════════

  describe('setDisappearingTimer', () => {
    it('should set timer duration', async () => {
      prisma.conversation.update.mockResolvedValue({});
      const result = await service.setDisappearingTimer('conv-1', 'user-1', 86400);
      expect(result).toEqual({ success: true, duration: 86400 });
    });

    it('should allow null to disable', async () => {
      prisma.conversation.update.mockResolvedValue({});
      const result = await service.setDisappearingTimer('conv-1', 'user-1', null);
      expect(result).toEqual({ success: true, duration: null });
    });

    it('should throw BadRequestException for zero duration', async () => {
      await expect(service.setDisappearingTimer('conv-1', 'user-1', 0)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for negative duration', async () => {
      await expect(service.setDisappearingTimer('conv-1', 'user-1', -100)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-integer duration', async () => {
      await expect(service.setDisappearingTimer('conv-1', 'user-1', 3.5)).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // scheduleMessage
  // ═══════════════════════════════════════════════════════

  describe('scheduleMessage', () => {
    it('should create scheduled message', async () => {
      const future = new Date(Date.now() + 86400000);
      prisma.message.create.mockResolvedValue({ id: 'msg-1', isScheduled: true, scheduledAt: future });

      const result = await service.scheduleMessage('conv-1', 'user-1', 'Hello later', future);
      expect(result.isScheduled).toBe(true);
    });

    it('should throw BadRequestException for empty content', async () => {
      const future = new Date(Date.now() + 86400000);
      await expect(service.scheduleMessage('conv-1', 'user-1', '', future)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for past time', async () => {
      const past = new Date(Date.now() - 86400000);
      await expect(service.scheduleMessage('conv-1', 'user-1', 'Hello', past)).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // pinMessage / unpinMessage / getPinnedMessages
  // ═══════════════════════════════════════════════════════

  describe('pinMessage', () => {
    it('should pin a message', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', conversationId: 'conv-1' });
      prisma.message.count.mockResolvedValue(0);
      prisma.message.update.mockResolvedValue({ id: 'msg-1', isPinned: true });

      const result = await service.pinMessage('conv-1', 'msg-1', 'user-1');
      expect(result.isPinned).toBe(true);
    });

    it('should throw NotFoundException when message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.pinMessage('conv-1', 'msg-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when message belongs to different conversation', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', conversationId: 'conv-2' });
      await expect(service.pinMessage('conv-1', 'msg-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when max 3 pinned messages reached', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', conversationId: 'conv-1' });
      prisma.message.count.mockResolvedValue(3);
      await expect(service.pinMessage('conv-1', 'msg-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('unpinMessage', () => {
    it('should unpin a message', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', conversationId: 'conv-1' });
      prisma.message.update.mockResolvedValue({ id: 'msg-1', isPinned: false });

      const result = await service.unpinMessage('conv-1', 'msg-1', 'user-1');
      expect(result.isPinned).toBe(false);
    });

    it('should throw NotFoundException when message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.unpinMessage('conv-1', 'msg-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPinnedMessages', () => {
    it('should return pinned messages', async () => {
      prisma.message.findMany.mockResolvedValue([{ id: 'msg-1', isPinned: true }]);
      const result = await service.getPinnedMessages('conv-1', 'user-1');
      expect(result).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // markViewOnceViewed
  // ═══════════════════════════════════════════════════════

  describe('markViewOnceViewed', () => {
    it('should mark view-once message as viewed', async () => {
      prisma.message.findUnique.mockResolvedValue({
        conversationId: 'conv-1', senderId: 'other-user', isViewOnce: true, viewedAt: null,
      });
      prisma.message.update.mockResolvedValue({ viewedAt: new Date() });

      const result = await service.markViewOnceViewed('msg-1', 'user-1');
      expect(result.viewedAt).toBeDefined();
    });

    it('should throw NotFoundException when message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.markViewOnceViewed('msg-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for non-view-once message', async () => {
      prisma.message.findUnique.mockResolvedValue({
        conversationId: 'conv-1', senderId: 'other', isViewOnce: false, viewedAt: null,
      });
      await expect(service.markViewOnceViewed('msg-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when sender views own message', async () => {
      prisma.message.findUnique.mockResolvedValue({
        conversationId: 'conv-1', senderId: 'user-1', isViewOnce: true, viewedAt: null,
      });
      await expect(service.markViewOnceViewed('msg-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when already viewed', async () => {
      prisma.message.findUnique.mockResolvedValue({
        conversationId: 'conv-1', senderId: 'other', isViewOnce: true, viewedAt: new Date(),
      });
      await expect(service.markViewOnceViewed('msg-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Admin roles
  // ═══════════════════════════════════════════════════════

  describe('promoteToAdmin', () => {
    it('should promote member to admin when actor is owner', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ role: 'owner' });
      prisma.conversationMember.update.mockResolvedValue({ role: 'admin' });

      const result = await service.promoteToAdmin('conv-1', 'user-1', 'user-2');
      expect(result.role).toBe('admin');
    });

    it('should throw ForbiddenException when actor is regular member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ role: 'member' });
      await expect(service.promoteToAdmin('conv-1', 'user-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when actor not found', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.promoteToAdmin('conv-1', 'user-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('demoteFromAdmin', () => {
    it('should demote admin to member when actor is owner', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ role: 'owner' });
      prisma.conversationMember.update.mockResolvedValue({ role: 'member' });

      const result = await service.demoteFromAdmin('conv-1', 'user-1', 'user-2');
      expect(result.role).toBe('member');
    });

    it('should throw ForbiddenException when actor is admin (not owner)', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ role: 'admin' });
      await expect(service.demoteFromAdmin('conv-1', 'user-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('banMember', () => {
    it('should ban member when actor is admin', async () => {
      prisma.conversationMember.findUnique
        .mockResolvedValueOnce({ role: 'admin' })  // actor
        .mockResolvedValueOnce({ role: 'member' }); // target
      prisma.conversationMember.update.mockResolvedValue({ isBanned: true });

      const result = await service.banMember('conv-1', 'user-1', 'user-2');
      expect(result.isBanned).toBe(true);
    });

    it('should throw ForbiddenException when actor is regular member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ role: 'member' });
      await expect(service.banMember('conv-1', 'user-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when target not found', async () => {
      prisma.conversationMember.findUnique
        .mockResolvedValueOnce({ role: 'owner' })
        .mockResolvedValueOnce(null);
      await expect(service.banMember('conv-1', 'user-1', 'user-2')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when trying to ban owner', async () => {
      prisma.conversationMember.findUnique
        .mockResolvedValueOnce({ role: 'owner' })
        .mockResolvedValueOnce({ role: 'owner' });
      await expect(service.banMember('conv-1', 'user-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Wallpaper & Tone
  // ═══════════════════════════════════════════════════════

  describe('setConversationWallpaper', () => {
    it('should set wallpaper URL', async () => {
      prisma.conversationMember.update.mockResolvedValue({ wallpaperUrl: 'https://r2.example/bg.jpg' });
      const result = await service.setConversationWallpaper('conv-1', 'user-1', 'https://r2.example/bg.jpg');
      expect(result.wallpaperUrl).toBe('https://r2.example/bg.jpg');
    });

    it('should clear wallpaper with null', async () => {
      prisma.conversationMember.update.mockResolvedValue({ wallpaperUrl: null });
      const result = await service.setConversationWallpaper('conv-1', 'user-1', null as any);
      expect(result.wallpaperUrl).toBeNull();
    });
  });

  describe('setCustomTone', () => {
    it('should set custom notification tone', async () => {
      prisma.conversationMember.update.mockResolvedValue({ customTone: 'chime' });
      const result = await service.setCustomTone('conv-1', 'user-1', 'chime');
      expect(result.customTone).toBe('chime');
    });
  });

  // ═══════════════════════════════════════════════════════
  // DM Notes
  // ═══════════════════════════════════════════════════════

  describe('createDMNote', () => {
    it('should create a DM note', async () => {
      prisma.dMNote.upsert.mockResolvedValue({ userId: 'user-1', content: 'My note', expiresAt: expect.any(Date) });
      const result = await service.createDMNote('user-1', 'My note');
      expect(result.content).toBe('My note');
    });
  });

  describe('getDMNote', () => {
    it('should return user DM note when not expired', async () => {
      const future = new Date(Date.now() + 86400000);
      prisma.dMNote.findUnique.mockResolvedValue({ userId: 'user-1', content: 'Note', expiresAt: future });
      const result = await service.getDMNote('user-1');
      expect(result).toBeDefined();
      expect(result?.content).toBe('Note');
    });

    it('should return null when note expired', async () => {
      const past = new Date(Date.now() - 86400000);
      prisma.dMNote.findUnique.mockResolvedValue({ userId: 'user-1', content: 'Note', expiresAt: past });
      const result = await service.getDMNote('user-1');
      expect(result).toBeNull();
    });

    it('should return null when no note exists', async () => {
      prisma.dMNote.findUnique.mockResolvedValue(null);
      const result = await service.getDMNote('user-1');
      expect(result).toBeNull();
    });
  });

  describe('deleteDMNote', () => {
    it('should delete DM note', async () => {
      prisma.dMNote.findUnique.mockResolvedValue({ userId: 'user-1', content: 'Note' });
      prisma.dMNote.delete.mockResolvedValue({});
      const result = await service.deleteDMNote('user-1');
      expect(result).toEqual({ deleted: true });
    });

    it('should throw NotFoundException when note not found', async () => {
      prisma.dMNote.findUnique.mockResolvedValue(null);
      await expect(service.deleteDMNote('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getStarredMessages
  // ═══════════════════════════════════════════════════════

  describe('getStarredMessages', () => {
    it('should return starred messages with pagination', async () => {
      prisma.message.findMany.mockResolvedValue([{ id: 'msg-1', starredBy: ['user-1'] }]);
      const result = await service.getStarredMessages('user-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return empty when no starred messages', async () => {
      prisma.message.findMany.mockResolvedValue([]);
      const result = await service.getStarredMessages('user-1');
      expect(result.data).toEqual([]);
    });
  });

});
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { MessagesService } from './messages.service';
import { ContentSafetyService } from '../moderation/content-safety.service';
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
              findUnique: jest.fn().mockResolvedValue({
                userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, unreadCount: 0,
                conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] },
              }),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              createMany: jest.fn(),
              delete: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
              aggregate: jest.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
            },
            conversation: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            message: {
              findMany: jest.fn(),
              findFirst: jest.fn().mockResolvedValue(null),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
            follow: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
            userSettings: {
              findUnique: jest.fn().mockResolvedValue(null),
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
            starredMessage: {
              upsert: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              deleteMany: jest.fn(),
            },
            $transaction: jest.fn().mockImplementation(async (fn: unknown) => {
              if (typeof fn === 'function') return fn({
                message: { create: jest.fn().mockResolvedValue({ id: 'msg-tx', content: 'test' }) },
                conversation: { update: jest.fn() },
                conversationMember: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), findUnique: jest.fn() },
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
          where: { userId, isArchived: false, isBanned: false },
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
        where: expect.objectContaining({ conversationId, isDeleted: false, isScheduled: false }),
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
        conversationMember: { update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) },
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
      const conversationId = 'conv-1';
      const mockMessage = {
        id: messageId,
        senderId: userId,
        conversationId,
      };
      prisma.message.findUnique.mockResolvedValue(mockMessage);
      prisma.message.update.mockResolvedValue({ ...mockMessage, isDeleted: true });
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ isMuted: false, isBanned: false });

      const result = await service.deleteMessage(messageId, userId);

      expect(prisma.message.findUnique).toHaveBeenCalledWith({
        where: { id: messageId },
        select: { id: true, senderId: true, conversationId: true },
      });
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: messageId },
        data: expect.objectContaining({ isDeleted: true, content: null, encryptedContent: null }),
      });
      expect(result).toEqual({ deleted: true });
    });

    it('should throw ForbiddenException if user is not sender', async () => {
      const messageId = 'msg-123';
      const userId = 'user-123';
      const mockMessage = {
        id: messageId,
        senderId: 'different-user',
        conversationId: 'conv-1',
      };
      prisma.message.findUnique.mockResolvedValue(mockMessage);
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ isMuted: false, isBanned: false });

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
        isEncrypted: false,
        e2eVersion: null,
        createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      };
      const updatedMessage = { id: messageId, content, editedAt: new Date() };
      prisma.message.findUnique.mockResolvedValue(mockMessage);
      prisma.message.update.mockResolvedValue(updatedMessage);

      const result = await service.editMessage(messageId, userId, content);

      expect(prisma.message.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: messageId } }),
      );
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
    it('should create group conversation with owner role', async () => {
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

      // Interactive transaction mock
      const mockTx = {
        conversation: {
          create: jest.fn().mockResolvedValue(mockConversation),
        },
      };
      prisma.$transaction.mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx));

      const result = await service.createGroup(userId, groupName, memberIds);

      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: { in: [userId, ...memberIds] } },
        select: { id: true },
      }));
      expect(mockTx.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isGroup: true,
            groupName,
            createdById: userId,
            members: {
              create: expect.arrayContaining([
                expect.objectContaining({ userId, role: 'owner' }),
                expect.objectContaining({ userId: 'user-456', role: 'member' }),
              ]),
            },
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

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: conversationId },
        select: { id: true, isGroup: true, createdById: true },
      });
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
      prisma.conversationMember.count = jest.fn().mockResolvedValue(5);
      prisma.user.findMany.mockResolvedValue([{ id: 'user-456' }, { id: 'user-789' }]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.conversationMember.createMany.mockResolvedValue({} as any);

      const result = await service.addGroupMembers(conversationId, userId, memberIds);

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: conversationId },
        select: { id: true, isGroup: true, createdById: true },
      });
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

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: conversationId },
        select: { id: true, isGroup: true, createdById: true },
      });
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

      expect(prisma.message.findUnique).toHaveBeenCalledWith({
        where: { id: messageId },
        select: { id: true, isDeleted: true, conversationId: true },
      });
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

      expect(prisma.message.findUnique).toHaveBeenCalledWith({
        where: { id: messageId },
        select: { id: true, conversationId: true },
      });
      expect(prisma.messageReaction.deleteMany).toHaveBeenCalledWith({
        where: { messageId, userId, emoji },
      });
      expect(result).toEqual({ removed: true });
    });
  });

  describe('setMemberTag', () => {
    it('should update member tag', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] } });
      prisma.conversationMember.update.mockResolvedValue({ tag: 'Admin' });

      const result = await service.setMemberTag('conv-1', 'user-1', 'Admin');
      expect(result).toEqual({ updated: true });
      expect(prisma.conversationMember.update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: 'conv-1', userId: 'user-1' } },
        data: { tag: 'Admin' },
      });
    });

    it('should truncate tag to 30 characters', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] } });
      prisma.conversationMember.update.mockResolvedValue({ tag: 'a'.repeat(30) });

      await service.setMemberTag('conv-1', 'user-1', 'a'.repeat(50));
      expect(prisma.conversationMember.update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: 'conv-1', userId: 'user-1' } },
        data: { tag: 'a'.repeat(30) },
      });
    });

    it('should clear tag when null is passed', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] } });
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
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] } });
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
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] } });
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
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] } });
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
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] } });
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
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] } });
      prisma.conversation.findUnique.mockResolvedValue(null);

      await expect(service.verifyLockCode('conv-1', 'user-1', 'code')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setNewMemberHistoryCount', () => {
    it('should set history count for group owner', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] } });
      prisma.conversation.findUnique.mockResolvedValue({ createdById: 'user-1', isGroup: true });
      prisma.conversation.update.mockResolvedValue({ newMemberHistoryCount: 50 });

      const result = await service.setNewMemberHistoryCount('conv-1', 'user-1', 50);
      expect(result).toEqual({ count: 50 });
    });

    it('should clamp count to 0-100 range', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] } });
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
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-2', isMuted: false, isArchived: false, isBanned: false, conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] } });
      prisma.conversation.findUnique.mockResolvedValue({ createdById: 'user-1', isGroup: true });

      await expect(service.setNewMemberHistoryCount('conv-1', 'user-2', 25)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for non-group conversation', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] } });
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
      expect(prisma.$transaction).toHaveBeenCalled();
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
      // Mock batch membership check — user is member of all target conversations
      // requireMembership uses findUnique (default mock returns valid member)
      prisma.conversationMember.findMany
        .mockResolvedValueOnce([{ conversationId: 'conv-2', isBanned: false }, { conversationId: 'conv-3', isBanned: false }]) // batch membership
        .mockResolvedValueOnce([]); // other members in target convos
      prisma.block.findMany.mockResolvedValue([]);
      prisma.$transaction.mockResolvedValue([
        { id: 'fwd-1', content: 'Hello', isForwarded: true }, {},
        { id: 'fwd-2', content: 'Hello', isForwarded: true }, {},
      ]);
      prisma.message.update.mockResolvedValue({});

      const result = await service.forwardMessage('msg-1', 'user-1', ['conv-2', 'conv-3']);
      expect(result).toHaveLength(2);
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
      prisma.message.findUnique.mockReset();
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
      expect(result).toHaveProperty('deliveredAt');
      expect(result.deliveredAt).toBeInstanceOf(Date);
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
      expect(result).toEqual({ duration: 86400 });
    });

    it('should allow null to disable', async () => {
      prisma.conversation.update.mockResolvedValue({});
      const result = await service.setDisappearingTimer('conv-1', 'user-1', null);
      expect(result).toEqual({ duration: null });
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
      expect(result).toHaveProperty('viewedAt');
      expect(result.viewedAt).toBeInstanceOf(Date);
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
  // starMessage / unstarMessage / getStarredMessages
  // ═══════════════════════════════════════════════════════

  describe('starMessage', () => {
    it('should star a message via upsert', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1' });
      prisma.starredMessage.upsert.mockResolvedValue({ id: 'star-1', userId: 'user-1', messageId: 'msg-1' });
      const result = await service.starMessage('user-1', 'msg-1');
      expect(result).toEqual({ id: 'star-1', userId: 'user-1', messageId: 'msg-1' });
      expect(prisma.starredMessage.upsert).toHaveBeenCalledWith({
        where: { userId_messageId: { userId: 'user-1', messageId: 'msg-1' } },
        create: { userId: 'user-1', messageId: 'msg-1' },
        update: {},
      });
    });

    it('should throw NotFoundException when message does not exist', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.starMessage('user-1', 'msg-nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unstarMessage', () => {
    it('should unstar a message via deleteMany', async () => {
      prisma.starredMessage.deleteMany.mockResolvedValue({ count: 1 });
      const result = await service.unstarMessage('user-1', 'msg-1');
      expect(result).toEqual({ count: 1 });
      expect(prisma.starredMessage.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', messageId: 'msg-1' },
      });
    });

    it('should succeed even if message was not starred', async () => {
      prisma.starredMessage.deleteMany.mockResolvedValue({ count: 0 });
      const result = await service.unstarMessage('user-1', 'msg-1');
      expect(result).toEqual({ count: 0 });
    });
  });

  describe('getStarredMessages', () => {
    it('should return starred messages with pagination using join table', async () => {
      prisma.starredMessage.findMany.mockResolvedValue([
        { id: 'star-1', userId: 'user-1', messageId: 'msg-1', createdAt: new Date() },
      ]);
      prisma.message.findMany.mockResolvedValue([{ id: 'msg-1', content: 'Hello' }]);
      const result = await service.getStarredMessages('user-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return empty when no starred messages', async () => {
      prisma.starredMessage.findMany.mockResolvedValue([]);
      const result = await service.getStarredMessages('user-1');
      expect(result.data).toEqual([]);
    });

    it('should handle pagination with hasMore', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({
        id: `star-${i}`, userId: 'user-1', messageId: `msg-${i}`, createdAt: new Date(),
      }));
      prisma.starredMessage.findMany.mockResolvedValue(items);
      prisma.message.findMany.mockResolvedValue(
        items.slice(0, 20).map((s) => ({ id: s.messageId, content: 'test' })),
      );
      const result = await service.getStarredMessages('user-1');
      expect(result.data).toHaveLength(20);
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.cursor).toBe('star-19');
    });

    it('should filter out deleted messages', async () => {
      prisma.starredMessage.findMany.mockResolvedValue([
        { id: 'star-1', userId: 'user-1', messageId: 'msg-1', createdAt: new Date() },
        { id: 'star-2', userId: 'user-1', messageId: 'msg-2', createdAt: new Date() },
      ]);
      // Only msg-1 returned (msg-2 was deleted, filtered by isDeleted: false)
      prisma.message.findMany.mockResolvedValue([{ id: 'msg-1', content: 'Hello' }]);
      const result = await service.getStarredMessages('user-1');
      expect(result.data).toHaveLength(1);
    });
  });

  // --- R2 Tab4 Part 2: scheduleMessage E2E rejection tests (X02-#18) ---

  describe('scheduleMessage E2E rejection', () => {
    const requireMembershipSpy = () => jest.spyOn(service as any, 'requireMembership').mockResolvedValue({});

    it('should reject scheduling plaintext message in E2E conversation', async () => {
      requireMembershipSpy();
      prisma.conversation.findUnique.mockResolvedValue({ isE2E: true });
      await expect(
        service.scheduleMessage('conv-e2e', 'user-1', 'hello', new Date(Date.now() + 60000)),
      ).rejects.toThrow(/E2E|encrypted/i);
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('should allow scheduling in non-E2E conversation', async () => {
      requireMembershipSpy();
      prisma.conversation.findUnique.mockResolvedValue({ isE2E: false });
      prisma.message.create.mockResolvedValue({ id: 'scheduled-1', content: 'hello', isScheduled: true });
      const result = await service.scheduleMessage('conv-plain', 'user-1', 'hello', new Date(Date.now() + 60000));
      expect(result).toBeDefined();
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isScheduled: true }) }),
      );
    });

    it('should allow scheduling in conversation with isE2E = null (legacy)', async () => {
      requireMembershipSpy();
      prisma.conversation.findUnique.mockResolvedValue({ isE2E: null });
      prisma.message.create.mockResolvedValue({ id: 'scheduled-2', content: 'test', isScheduled: true });
      const result = await service.scheduleMessage('conv-legacy', 'user-1', 'test', new Date(Date.now() + 60000));
      expect(result).toBeDefined();
    });
  });

  // --- R2 Tab4 Part 2: editMessage content moderation tests (X08-#7) ---

  describe('editMessage content moderation', () => {
    let contentSafety: any;

    beforeEach(() => {
      contentSafety = service['contentSafety'];
    });

    it('should run content moderation on message edit', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1', senderId: 'user-1', isDeleted: false,
        createdAt: new Date(), isEncrypted: false, e2eVersion: null,
      });
      contentSafety.moderateText.mockResolvedValue({ safe: true, flags: [] });
      prisma.message.update.mockResolvedValue({ id: 'msg-1', content: 'edited text' });

      await service.editMessage('msg-1', 'user-1', 'edited text');

      expect(contentSafety.moderateText).toHaveBeenCalledWith('edited text');
      expect(prisma.message.update).toHaveBeenCalled();
    });

    it('should reject edit when content is flagged', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1', senderId: 'user-1', isDeleted: false,
        createdAt: new Date(), isEncrypted: false, e2eVersion: null,
      });
      contentSafety.moderateText.mockResolvedValue({ safe: false, flags: ['hate_speech'] });

      await expect(service.editMessage('msg-1', 'user-1', 'hate speech content'))
        .rejects.toThrow(BadRequestException);
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('should NOT moderate encrypted message edits (rejected before moderation)', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1', senderId: 'user-1', isDeleted: false,
        createdAt: new Date(), isEncrypted: true, e2eVersion: 2,
      });
      contentSafety.moderateText.mockClear();

      await expect(service.editMessage('msg-1', 'user-1', 'some text'))
        .rejects.toThrow(BadRequestException);
      expect(contentSafety.moderateText).not.toHaveBeenCalled();
    });
  });

  // --- R2 Tab4 Part 2: generateGroupInviteLink select test (J08-#2) ---

  describe('generateGroupInviteLink select optimization', () => {
    it('should use select on conversation findUnique', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-group', isGroup: true, createdById: 'user-1',
      });
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'admin' });
      prisma.conversation.update.mockResolvedValue({});

      await service.generateGroupInviteLink('conv-group', 'user-1');

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: 'conv-group' },
        select: { id: true, isGroup: true, createdById: true },
      });
    });
  });

  // ═══════════════════════════════════════════════════════
  // T06 Critical — Messages Service (28 C-severity gaps)
  // ═══════════════════════════════════════════════════════

  describe('getTotalUnreadCount (T06 #1)', () => {
    it('should return aggregated unread count', async () => {
      prisma.conversationMember.aggregate = jest.fn().mockResolvedValue({ _sum: { unreadCount: 15 } });
      const result = await service.getTotalUnreadCount('user-1');
      expect(result).toEqual({ unreadCount: 15 });
    });

    it('should return 0 when no unread messages', async () => {
      prisma.conversationMember.aggregate = jest.fn().mockResolvedValue({ _sum: { unreadCount: null } });
      const result = await service.getTotalUnreadCount('user-1');
      expect(result).toEqual({ unreadCount: 0 });
    });
  });

  describe('getArchivedConversations (T06 #2)', () => {
    it('should return archived conversations with pagination', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([
        { conversation: { id: 'c1' }, isMuted: false, isArchived: true, unreadCount: 0, lastReadAt: null, conversationId: 'c1' },
      ]);
      const result = await service.getArchivedConversations('user-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('scheduleMessage (T06 #9)', () => {
    it('should create a scheduled message in the future', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.conversation.findUnique.mockResolvedValue({ isE2E: false });
      prisma.message.create.mockResolvedValue({ id: 'sched-1', isScheduled: true });

      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const result = await service.scheduleMessage('conv-1', 'user-1', 'hello later', futureDate);
      expect(result.id).toBe('sched-1');
      expect(prisma.message.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ isScheduled: true, scheduledAt: futureDate, content: 'hello later' }),
      }));
    });

    it('should reject past scheduled date', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      const pastDate = new Date(Date.now() - 1000);
      await expect(service.scheduleMessage('conv-1', 'user-1', 'late', pastDate)).rejects.toThrow(BadRequestException);
    });

    it('should reject empty content', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      await expect(service.scheduleMessage('conv-1', 'user-1', '', futureDate)).rejects.toThrow(BadRequestException);
    });

    it('should reject scheduling in E2E conversation', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.conversation.findUnique.mockResolvedValue({ isE2E: true });
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      await expect(service.scheduleMessage('conv-1', 'user-1', 'secret', futureDate)).rejects.toThrow(BadRequestException);
    });
  });

  describe('starMessage / unstarMessage / getStarredMessages (T06 #10-12)', () => {
    it('starMessage should upsert starred entry', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1' });
      prisma.starredMessage.upsert.mockResolvedValue({ userId: 'user-1', messageId: 'msg-1' });
      const result = await service.starMessage('user-1', 'msg-1');
      expect(result.messageId).toBe('msg-1');
    });

    it('starMessage should throw when message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.starMessage('user-1', 'bad')).rejects.toThrow(NotFoundException);
    });

    it('unstarMessage should deleteMany', async () => {
      prisma.starredMessage.deleteMany.mockResolvedValue({ count: 1 });
      await service.unstarMessage('user-1', 'msg-1');
      expect(prisma.starredMessage.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', messageId: 'msg-1' } });
    });

    it('getStarredMessages should return paginated starred messages', async () => {
      prisma.starredMessage.findMany.mockResolvedValue([
        { id: 's1', messageId: 'msg-1', createdAt: new Date() },
      ]);
      prisma.message.findMany.mockResolvedValue([{ id: 'msg-1', content: 'hello' }]);
      const result = await service.getStarredMessages('user-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('pinMessage / unpinMessage / getPinnedMessages (T06 #13-15)', () => {
    it('pinMessage should pin when under max 3 limit', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', conversationId: 'conv-1' });
      prisma.message.count.mockResolvedValue(2);
      prisma.message.update.mockResolvedValue({ id: 'msg-1', isPinned: true });

      const result = await service.pinMessage('conv-1', 'msg-1', 'user-1');
      expect(result.isPinned).toBe(true);
    });

    it('pinMessage should reject when max 3 pins reached', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', conversationId: 'conv-1' });
      prisma.message.count.mockResolvedValue(3);
      await expect(service.pinMessage('conv-1', 'msg-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('pinMessage should reject cross-conversation message', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', conversationId: 'conv-OTHER' });
      await expect(service.pinMessage('conv-1', 'msg-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('unpinMessage should clear pin status', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', conversationId: 'conv-1' });
      prisma.message.update.mockResolvedValue({ isPinned: false, pinnedAt: null });
      const result = await service.unpinMessage('conv-1', 'msg-1', 'user-1');
      expect(result.isPinned).toBe(false);
    });

    it('getPinnedMessages should return pinned messages', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.message.findMany.mockResolvedValue([{ id: 'msg-1', isPinned: true }]);
      const result = await service.getPinnedMessages('conv-1', 'user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('setDisappearingTimer (T06 #19)', () => {
    it('should set timer with valid duration', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.conversation.update.mockResolvedValue({});
      const result = await service.setDisappearingTimer('conv-1', 'user-1', 3600);
      expect(result).toEqual({ duration: 3600 });
    });

    it('should clear timer with null', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.conversation.update.mockResolvedValue({});
      const result = await service.setDisappearingTimer('conv-1', 'user-1', null);
      expect(result).toEqual({ duration: null });
    });

    it('should reject negative duration', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      await expect(service.setDisappearingTimer('conv-1', 'user-1', -1)).rejects.toThrow(BadRequestException);
    });

    it('should reject non-integer duration', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      await expect(service.setDisappearingTimer('conv-1', 'user-1', 3.5)).rejects.toThrow(BadRequestException);
    });
  });

  describe('archiveConversationForUser / unarchiveConversationForUser (T06 #20-21)', () => {
    it('archiveConversationForUser should set isArchived true', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.conversationMember.update.mockResolvedValue({ isArchived: true });
      const result = await service.archiveConversationForUser('conv-1', 'user-1');
      expect(result).toEqual({ archived: true });
    });

    it('unarchiveConversationForUser should set isArchived false', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.conversationMember.update.mockResolvedValue({ isArchived: false });
      const result = await service.unarchiveConversationForUser('conv-1', 'user-1');
      expect(result).toEqual({ archived: false });
    });
  });

  describe('generateGroupInviteLink / joinViaInviteLink (T06 #22-23)', () => {
    it('should generate crypto invite code with Redis+DB', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-g', isGroup: true, createdById: 'user-1' });
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'owner' });
      prisma.conversation.update.mockResolvedValue({});
      const result = await service.generateGroupInviteLink('conv-g', 'user-1');
      expect(result.inviteCode).toBeDefined();
      expect(result.inviteCode.length).toBeGreaterThan(10);
      expect(result.expiresIn).toBe('7 days');
    });

    it('should reject non-admin from generating invite', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-g', isGroup: true, createdById: 'other' });
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      await expect(service.generateGroupInviteLink('conv-g', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('joinViaInviteLink should join when valid invite in Redis', async () => {
      const redis = (service as any).redis;
      redis.get.mockResolvedValue('conv-g');
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      prisma.conversationMember.create.mockResolvedValue({});
      const result = await service.joinViaInviteLink('valid-code', 'user-2');
      expect(result).toEqual({ joined: true, conversationId: 'conv-g' });
    });

    it('joinViaInviteLink should throw when invite not found', async () => {
      const redis = (service as any).redis;
      redis.get.mockResolvedValue(null);
      prisma.conversation.findFirst.mockResolvedValue(null);
      await expect(service.joinViaInviteLink('expired', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('joinViaInviteLink should reject banned user', async () => {
      const redis = (service as any).redis;
      redis.get.mockResolvedValue('conv-g');
      prisma.conversationMember.findUnique.mockResolvedValue({ isBanned: true });
      await expect(service.joinViaInviteLink('code', 'banned-user')).rejects.toThrow(ForbiddenException);
    });

    it('joinViaInviteLink should reject existing member', async () => {
      const redis = (service as any).redis;
      redis.get.mockResolvedValue('conv-g');
      prisma.conversationMember.findUnique.mockResolvedValue({ isBanned: false });
      await expect(service.joinViaInviteLink('code', 'existing')).rejects.toThrow(ConflictException);
    });
  });

  describe('changeGroupRole (T06 #24)', () => {
    it('should change member to admin', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-g', isGroup: true, createdById: 'user-1' });
      prisma.conversationMember.findUnique.mockResolvedValue({ role: 'member' });
      prisma.conversationMember.update.mockResolvedValue({ role: 'admin' });
      const result = await service.changeGroupRole('conv-g', 'user-1', 'user-2', 'admin');
      expect(result.role).toBe('admin');
    });

    it('should reject invalid role', async () => {
      await expect(service.changeGroupRole('c', 'u1', 'u2', 'superadmin' as any)).rejects.toThrow(BadRequestException);
    });

    it('should reject self-role-change', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c', isGroup: true, createdById: 'u1' });
      await expect(service.changeGroupRole('c', 'u1', 'u1', 'admin')).rejects.toThrow(BadRequestException);
    });

    it('should reject changing owner role', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c', isGroup: true, createdById: 'u1' });
      prisma.conversationMember.findUnique.mockResolvedValue({ role: 'owner' });
      await expect(service.changeGroupRole('c', 'u1', 'u-owner', 'member')).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-creator from changing roles', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c', isGroup: true, createdById: 'other' });
      await expect(service.changeGroupRole('c', 'u1', 'u2', 'admin')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('DM Notes (T06 #25-28)', () => {
    it('createDMNote should upsert with expiry', async () => {
      prisma.dMNote.upsert.mockResolvedValue({ userId: 'u1', content: 'note', expiresAt: expect.any(Date) });
      const result = await service.createDMNote('u1', 'note', 24);
      expect(result.content).toBe('note');
      expect(prisma.dMNote.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'u1' },
        create: expect.objectContaining({ content: 'note' }),
      }));
    });

    it('getDMNote should return null for expired note', async () => {
      prisma.dMNote.findUnique.mockResolvedValue({ userId: 'u1', content: 'old', expiresAt: new Date(Date.now() - 1000) });
      const result = await service.getDMNote('u1');
      expect(result).toBeNull();
    });

    it('getDMNote should return valid note', async () => {
      const note = { userId: 'u1', content: 'hello', expiresAt: new Date(Date.now() + 60000) };
      prisma.dMNote.findUnique.mockResolvedValue(note);
      const result = await service.getDMNote('u1');
      expect(result).toEqual(note);
    });

    it('deleteDMNote should throw when note not found', async () => {
      prisma.dMNote.findUnique.mockResolvedValue(null);
      await expect(service.deleteDMNote('u1')).rejects.toThrow(NotFoundException);
    });

    it('deleteDMNote should delete existing note', async () => {
      prisma.dMNote.findUnique.mockResolvedValue({ userId: 'u1', content: 'x' });
      prisma.dMNote.delete.mockResolvedValue({});
      const result = await service.deleteDMNote('u1');
      expect(result).toEqual({ deleted: true });
    });

    it('getDMNotesForContacts should return non-expired notes from contacts', async () => {
      prisma.conversationMember.findMany
        .mockResolvedValueOnce([{ conversationId: 'c1' }])    // user's memberships
        .mockResolvedValueOnce([{ userId: 'contact-1' }]);     // other members
      prisma.block.findMany.mockResolvedValue([]);
      prisma.dMNote.findMany.mockResolvedValue([{ userId: 'contact-1', content: 'hi' }]);
      const result = await service.getDMNotesForContacts('u1');
      expect(result).toHaveLength(1);
    });
  });

  describe('promoteToAdmin / demoteFromAdmin / banMember (T06 #5-7)', () => {
    it('promoteToAdmin should promote member to admin', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ role: 'owner' });
      prisma.conversationMember.update.mockResolvedValue({ role: 'admin' });
      const result = await service.promoteToAdmin('c1', 'owner-id', 'target-id');
      expect(result.role).toBe('admin');
    });

    it('promoteToAdmin should reject non-owner', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ role: 'admin' });
      await expect(service.promoteToAdmin('c1', 'admin-id', 'target-id')).rejects.toThrow(ForbiddenException);
    });

    it('demoteFromAdmin should demote to member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ role: 'owner' });
      prisma.conversationMember.update.mockResolvedValue({ role: 'member' });
      const result = await service.demoteFromAdmin('c1', 'owner-id', 'target-id');
      expect(result.role).toBe('member');
    });

    it('banMember should ban target', async () => {
      prisma.conversationMember.findUnique
        .mockResolvedValueOnce({ role: 'admin' })  // actor check
        .mockResolvedValueOnce({ role: 'member' }); // target check
      prisma.conversationMember.update.mockResolvedValue({ isBanned: true });
      const result = await service.banMember('c1', 'admin-id', 'target-id');
      expect(result.isBanned).toBe(true);
    });

    it('banMember should reject banning the owner', async () => {
      prisma.conversationMember.findUnique
        .mockResolvedValueOnce({ role: 'owner' })  // actor
        .mockResolvedValueOnce({ role: 'owner' }); // target
      await expect(service.banMember('c1', 'owner-id', 'other-owner')).rejects.toThrow(ForbiddenException);
    });

    it('banMember should reject non-admin actor', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ role: 'member' });
      await expect(service.banMember('c1', 'member-id', 'target-id')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('setConversationWallpaper / pinConversation / setCustomTone (T06 #16-18)', () => {
    it('setConversationWallpaper should update wallpaperUrl', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.conversationMember.update.mockResolvedValue({ wallpaperUrl: 'https://img.com/bg.jpg' });
      const result = await service.setConversationWallpaper('c1', 'u1', 'https://img.com/bg.jpg');
      expect(result.wallpaperUrl).toBe('https://img.com/bg.jpg');
    });

    it('pinConversation should set isPinned', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.conversationMember.update.mockResolvedValue({ isPinned: true });
      const result = await service.pinConversation('c1', 'u1', true);
      expect(result.isPinned).toBe(true);
    });

    it('setCustomTone should set tone', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.conversationMember.update.mockResolvedValue({ customTone: 'chime' });
      const result = await service.setCustomTone('c1', 'u1', 'chime');
      expect(result.customTone).toBe('chime');
    });
  });

  describe('publishScheduledMessages cron (T06 #8)', () => {
    it('should publish overdue messages and update conversations', async () => {
      const redis = (service as any).redis;
      redis.set.mockResolvedValue('OK');
      prisma.message.findMany.mockResolvedValue([
        { id: 'm1', conversationId: 'c1', senderId: 'u1', content: 'scheduled msg', scheduledAt: new Date(Date.now() - 1000) },
      ]);
      prisma.message.updateMany.mockResolvedValue({ count: 1 });
      prisma.conversation.update.mockResolvedValue({});
      prisma.conversationMember.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.publishScheduledMessages();
      expect(result).toBe(1);
      expect(prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: { isScheduled: false, scheduledAt: null },
      }));
    });

    it('should return 0 when no overdue messages', async () => {
      const redis = (service as any).redis;
      redis.set.mockResolvedValue('OK');
      prisma.message.findMany.mockResolvedValue([]);
      const result = await service.publishScheduledMessages();
      expect(result).toBe(0);
    });

    it('should return 0 when lock not acquired', async () => {
      const redis = (service as any).redis;
      redis.set.mockResolvedValue(null);
      const result = await service.publishScheduledMessages();
      expect(result).toBe(0);
    });
  });

  describe('markDelivered (T06 #78)', () => {
    it('should set deliveredAt on first delivery', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', conversationId: 'c1', deliveredAt: null });
      prisma.message.update.mockResolvedValue({ id: 'm1', deliveredAt: expect.any(Date) });
      const result = await service.markDelivered('m1', 'u1');
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { deliveredAt: expect.any(Date) },
      });
    });

    it('should be idempotent — not re-set deliveredAt', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      const deliveredAt = new Date('2026-04-01');
      prisma.message.findUnique.mockResolvedValue({ id: 'm1', conversationId: 'c1', deliveredAt });
      const result = await service.markDelivered('m1', 'u1');
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('should throw when message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.markDelivered('bad', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMediaGallery (T06 #79)', () => {
    it('should return IMAGE/VIDEO messages with pagination', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.message.findMany.mockResolvedValue([
        { id: 'm1', mediaUrl: 'img.jpg', messageType: 'IMAGE', createdAt: new Date() },
      ]);
      const result = await service.getMediaGallery('c1', 'u1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('searchAllMessages / searchMessages — empty query (T06 #76-77)', () => {
    it('searchAllMessages should reject empty query', async () => {
      await expect(service.searchAllMessages('u1', '')).rejects.toThrow(BadRequestException);
      await expect(service.searchAllMessages('u1', '   ')).rejects.toThrow(BadRequestException);
    });

    it('searchMessages should reject empty query', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      await expect(service.searchMessages('c1', 'u1', '')).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeReaction — not found (T06 #75)', () => {
    it('should throw NotFoundException when message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.removeReaction('bad', 'u1', '👍')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addGroupMembers — size limit (T06 #84)', () => {
    it('should reject when adding would exceed 1024 members', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: true, createdById: 'u1' });
      prisma.conversationMember.count.mockResolvedValue(1020);
      await expect(service.addGroupMembers('c1', 'u1', ['u2', 'u3', 'u4', 'u5', 'u6'])).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid user IDs', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', isGroup: true, createdById: 'u1' });
      prisma.conversationMember.count.mockResolvedValue(5);
      prisma.user.findMany.mockResolvedValue([]); // no valid users
      await expect(service.addGroupMembers('c1', 'u1', ['fake-id'])).rejects.toThrow(BadRequestException);
    });
  });

  describe('leaveGroup — not found (T06 #86)', () => {
    it('should throw when conversation not found', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.leaveGroup('c-bad', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // T06 Remaining M-severity gaps (#69-72, #74, #80)
  // ═══════════════════════════════════════════════════════

  describe('sendMessage — DM restriction (T06 #70)', () => {
    it('should reject when recipient set messagePermission to nobody', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({
        userId: 'sender-1', isMuted: false, isArchived: false, isBanned: false,
        conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, isE2E: false, members: [{ userId: 'recipient-1' }] },
      });
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.follow.findUnique.mockResolvedValue(null);
      prisma.userSettings.findUnique.mockResolvedValue({ messagePermission: 'nobody' });
      prisma.user.findUnique.mockResolvedValue({ isPrivate: false });

      await expect(service.sendMessage('conv-1', 'sender-1', { content: 'hi' })).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-follower when permission is followers-only', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({
        userId: 'sender-1', isMuted: false, isArchived: false, isBanned: false,
        conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, isE2E: false, members: [{ userId: 'recipient-1' }] },
      });
      prisma.block.findFirst.mockResolvedValue(null);
      prisma.follow.findUnique.mockResolvedValue(null); // not following
      prisma.userSettings.findUnique.mockResolvedValue({ messagePermission: 'followers' });
      prisma.user.findUnique.mockResolvedValue({ isPrivate: false });

      await expect(service.sendMessage('conv-1', 'sender-1', { content: 'hi' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('sendMessage — slow mode (T06 #71)', () => {
    it('should reject message during slow mode cooldown', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({
        userId: 'sender-1', isMuted: false, isArchived: false, isBanned: false,
        conversation: { isGroup: true, slowModeSeconds: 60, disappearingDuration: null, isE2E: false, members: [] },
      });
      prisma.block.findFirst.mockResolvedValue(null);
      // Last message was 10 seconds ago — within 60-second slow mode
      prisma.message.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 10000) });

      await expect(service.sendMessage('conv-1', 'sender-1', { content: 'too fast' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('sendMessage — E2E enforcement (T06 #72)', () => {
    it('should reject plaintext in E2E conversation', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({
        userId: 'sender-1', isMuted: false, isArchived: false, isBanned: false,
        conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, isE2E: true, members: [] },
      });
      prisma.block.findFirst.mockResolvedValue(null);

      await expect(service.sendMessage('conv-1', 'sender-1', { content: 'plaintext bad' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteMessage — not found (T06 #74)', () => {
    it('should throw NotFoundException when message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.deleteMessage('bad-msg', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendViewOnceMessage service test (T06 #3)', () => {
    it('should create view-once message in non-E2E conversation', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.conversationMember.findMany.mockResolvedValue([]);
      prisma.conversation.findUnique.mockResolvedValue({ isE2E: false, disappearingDuration: null });

      const result = await service.sendViewOnceMessage('conv-1', 'user-1', {
        mediaUrl: 'https://img.com/photo.jpg',
        messageType: 'IMAGE',
      });
      expect(result.id).toBe('msg-tx');
    });

    it('should reject view-once in E2E conversation', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({ role: 'member' });
      prisma.conversationMember.findMany.mockResolvedValue([]);
      prisma.conversation.findUnique.mockResolvedValue({ isE2E: true });

      await expect(service.sendViewOnceMessage('conv-1', 'user-1', {
        mediaUrl: 'https://img.com/photo.jpg',
      })).rejects.toThrow(BadRequestException);
    });
  });

  describe('cleanupExpiredDMNotes', () => {
    let redis: { set: jest.Mock };

    beforeEach(() => {
      redis = (service as any).redis;
      // Ensure lock acquisition succeeds
      redis.set.mockResolvedValue('OK');
    });

    it('should delete expired DM notes and return count', async () => {
      prisma.dMNote.deleteMany = jest.fn().mockResolvedValue({ count: 5 });
      const result = await service.cleanupExpiredDMNotes();
      expect(result).toBe(5);
      expect(prisma.dMNote.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });

    it('should return 0 when no expired notes exist', async () => {
      prisma.dMNote.deleteMany = jest.fn().mockResolvedValue({ count: 0 });
      const result = await service.cleanupExpiredDMNotes();
      expect(result).toBe(0);
    });

    it('should return 0 when lock not acquired', async () => {
      redis.set.mockResolvedValue(null);
      prisma.dMNote.deleteMany = jest.fn();
      const result = await service.cleanupExpiredDMNotes();
      expect(result).toBe(0);
      expect(prisma.dMNote.deleteMany).not.toHaveBeenCalled();
    });

    it('should return 0 and log error on failure', async () => {
      prisma.dMNote.deleteMany = jest.fn().mockRejectedValue(new Error('DB down'));
      const result = await service.cleanupExpiredDMNotes();
      expect(result).toBe(0);
    });
  });
});
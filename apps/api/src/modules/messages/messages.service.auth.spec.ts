import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { MessagesService } from './messages.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MessagesService — authorization matrix', () => {
  let service: MessagesService;
  let prisma: any;
  const userA = 'user-a';
  const userB = 'user-b';
  const convId = 'conv-1';

  const mockMembership = { userId: userA, isMuted: false, isArchived: false, isBanned: false, unreadCount: 0 };

  beforeEach(async () => {
    const txPrisma = {
      message: { create: jest.fn().mockResolvedValue({ id: 'msg-tx', content: 'test' }) },
      conversation: { update: jest.fn() },
      conversationMember: { updateMany: jest.fn() },
    };

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
            conversation: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
            message: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0) },
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

  describe('sendMessage — membership check', () => {
    it('should throw ForbiddenException when non-member sends', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.sendMessage(convId, userB, { content: 'hi' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when banned member sends', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ ...mockMembership, isBanned: true });
      await expect(service.sendMessage(convId, userA, { content: 'hi' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('editMessage — sender check', () => {
    it('should allow sender to edit their message', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1', senderId: userA, conversationId: convId, isDeleted: false, createdAt: new Date(),
      });
      prisma.message.update.mockResolvedValue({ id: 'msg-1', content: 'edited', editedAt: new Date() });

      const result = await service.editMessage('msg-1', userA, 'edited');
      expect(result.message.content).toBe('edited');
    });

    it('should throw ForbiddenException when non-sender edits', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-1', senderId: userA, conversationId: convId, isDeleted: false, createdAt: new Date(),
      });
      await expect(service.editMessage('msg-1', userB, 'hacked'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteMessage — sender check', () => {
    it('should allow sender to delete', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', senderId: userA });
      prisma.message.update.mockResolvedValue({});
      const result = await service.deleteMessage('msg-1', userA);
      expect(result.deleted).toBe(true);
    });

    it('should throw ForbiddenException when non-sender deletes', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', senderId: userA });
      await expect(service.deleteMessage('msg-1', userB))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateGroup — creator check', () => {
    it('should allow creator to update group', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: convId, isGroup: true, createdById: userA });
      prisma.conversation.update.mockResolvedValue({ id: convId, groupName: 'New Name' });
      const result = await service.updateGroup(convId, userA, { groupName: 'New Name' });
      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException when non-creator updates', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: convId, isGroup: true, createdById: userA });
      await expect(service.updateGroup(convId, userB, { groupName: 'Hacked' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('reactToMessage — membership check', () => {
    it('should throw ForbiddenException when non-member reacts', async () => {
      prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', conversationId: convId, isDeleted: false });
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.reactToMessage('msg-1', userB, '👍'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('createDM — block check', () => {
    it('should throw BadRequestException when DMing yourself', async () => {
      await expect(service.createDM(userA, userA))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when DMing a blocked user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: userB });
      prisma.block.findFirst.mockResolvedValue({ id: 'block-1' });
      await expect(service.createDM(userA, userB))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMessages — membership check', () => {
    it('should throw ForbiddenException when non-member reads messages', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.getMessages(convId, userB))
        .rejects.toThrow(ForbiddenException);
    });
  });
});

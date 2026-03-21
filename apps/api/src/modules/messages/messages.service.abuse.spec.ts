import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { MessagesService } from './messages.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MessagesService — abuse vectors (Task 99)', () => {
  let service: MessagesService;
  let prisma: any;

  const mockMembership = { userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, unreadCount: 0 };

  beforeEach(async () => {
    const txPrisma = {
      message: { create: jest.fn().mockResolvedValue({ id: 'msg-tx', content: 'test' }) },
      conversation: { update: jest.fn() },
      conversationMember: { updateMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        MessagesService,
        {
          provide: PrismaService,
          useValue: {
            conversationMember: {
              findMany: jest.fn(), findUnique: jest.fn().mockResolvedValue(mockMembership),
              create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), createMany: jest.fn(), delete: jest.fn(),
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

  it('should reject message with no content and no media', async () => {
    await expect(service.sendMessage('conv-1', 'user-1', {}))
      .rejects.toThrow(BadRequestException);
  });

  it('should reject forwarding to more than 5 conversations', async () => {
    const targets = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
    await expect(service.forwardMessage('msg-1', 'user-1', targets))
      .rejects.toThrow(BadRequestException);
  });

  it('should reject forwarding to 0 conversations', async () => {
    await expect(service.forwardMessage('msg-1', 'user-1', []))
      .rejects.toThrow(BadRequestException);
  });

  it('should reject message from banned member', async () => {
    prisma.conversationMember.findUnique.mockResolvedValue({ ...mockMembership, isBanned: true });
    await expect(service.sendMessage('conv-1', 'user-1', { content: 'hi' }))
      .rejects.toThrow(ForbiddenException);
  });

  it('should reject message from non-member', async () => {
    prisma.conversationMember.findUnique.mockResolvedValue(null);
    await expect(service.sendMessage('conv-1', 'user-1', { content: 'hi' }))
      .rejects.toThrow(ForbiddenException);
  });

  it('should reject DM to yourself', async () => {
    await expect(service.createDM('user-1', 'user-1'))
      .rejects.toThrow(BadRequestException);
  });

  it('should reject DM to blocked user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-2' });
    prisma.block.findFirst.mockResolvedValue({ id: 'block-1' });
    await expect(service.createDM('user-1', 'user-2'))
      .rejects.toThrow(ForbiddenException);
  });

  it('should reject editing deleted message', async () => {
    prisma.message.findUnique.mockResolvedValue({ id: 'msg-1', senderId: 'user-1', isDeleted: true, createdAt: new Date() });
    await expect(service.editMessage('msg-1', 'user-1', 'updated'))
      .rejects.toThrow(BadRequestException);
  });
});

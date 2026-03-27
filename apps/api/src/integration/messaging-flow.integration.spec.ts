import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { MessagesService } from '../modules/messages/messages.service';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';

/**
 * Integration: Messaging Flow
 * Send message → Get messages → Edit → Delete → Mark read
 */
describe('Integration: Messaging Flow', () => {
  let messagesService: MessagesService;
  let prisma: any;

  const mockUser = { id: 'user-1', username: 'alice', displayName: 'Alice', avatarUrl: null };
  const mockConversation = {
    id: 'conv-1', isGroup: false, participants: [
      { userId: 'user-1', user: mockUser },
      { userId: 'user-2', user: { id: 'user-2', username: 'bob', displayName: 'Bob', avatarUrl: null } },
    ],
  };
  const mockMessage = {
    id: 'msg-1', conversationId: 'conv-1', senderId: 'user-1', content: 'Hello!',
    messageType: 'TEXT', createdAt: new Date(), sender: mockUser, isEdited: false,
    isDeleted: false, readReceipts: [],
  };

  beforeEach(async () => {
    const prismaValue: any = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue(mockConversation),
        create: jest.fn().mockResolvedValue(mockConversation),
        findFirst: jest.fn().mockResolvedValue(mockConversation),
        update: jest.fn().mockResolvedValue(mockConversation),
      },
      conversationMember: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', conversationId: 'conv-1', isMuted: false, isBanned: false, isArchived: false, conversation: { isGroup: false, slowModeSeconds: null, disappearingDuration: null, members: [] } }),
        findMany: jest.fn().mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-2' }]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      message: {
        create: jest.fn().mockResolvedValue(mockMessage),
        findUnique: jest.fn().mockResolvedValue(mockMessage),
        findMany: jest.fn().mockResolvedValue([mockMessage]),
        update: jest.fn().mockResolvedValue({ ...mockMessage, content: 'Edited!', isEdited: true }),
        delete: jest.fn().mockResolvedValue(mockMessage),
        count: jest.fn().mockResolvedValue(1),
      },
      readReceipt: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(mockUser) },
      block: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn().mockImplementation((fnOrArr: any) => {
        if (typeof fnOrArr === 'function') return fnOrArr(prismaValue);
        return Promise.resolve(fnOrArr);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        MessagesService,
        { provide: PrismaService, useValue: prismaValue },
      ],
    }).compile();

    messagesService = module.get(MessagesService);
    prisma = module.get(PrismaService) as any;
  });

  it('should send a message', async () => {
    const result = await messagesService.sendMessage('conv-1', 'user-1', { content: 'Hello!', messageType: 'TEXT' } as any);
    expect(result.content).toBe('Hello!');
    expect(prisma.message.create).toHaveBeenCalled();
  });

  it('should get conversation messages', async () => {
    const result = await messagesService.getMessages('conv-1', 'user-1');
    expect(result.data).toHaveLength(1);
  });

  it('should edit a message', async () => {
    const result = await messagesService.editMessage('msg-1', 'user-1', 'Edited!');
    expect(result.message.content).toBe('Edited!');
  });

  it('should throw ForbiddenException when editing other user message', async () => {
    prisma.message.findUnique.mockResolvedValue({ ...mockMessage, senderId: 'user-2' });
    await expect(messagesService.editMessage('msg-1', 'user-1', 'Nope')).rejects.toThrow(ForbiddenException);
  });

  it('should delete a message', async () => {
    await messagesService.deleteMessage('msg-1', 'user-1');
    expect(prisma.message.update).toHaveBeenCalled();
  });

  it('should throw when deleting non-existent message', async () => {
    prisma.message.findUnique.mockResolvedValue(null);
    await expect(messagesService.deleteMessage('missing', 'user-1')).rejects.toThrow(NotFoundException);
  });
});

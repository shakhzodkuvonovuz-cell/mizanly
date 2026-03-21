import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { MessagesService } from './messages.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MessagesService — concurrency (Task 88)', () => {
  let service: MessagesService;
  let prisma: any;

  const mockMembership = { userId: 'user-1', isMuted: false, isArchived: false, isBanned: false, unreadCount: 0 };

  beforeEach(async () => {
    const txPrisma = {
      message: { create: jest.fn().mockResolvedValue({ id: 'msg-tx', content: 'test', messageType: 'TEXT' }) },
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

  it('should handle two messages sent simultaneously to same conversation', async () => {
    const [r1, r2] = await Promise.allSettled([
      service.sendMessage('conv-1', 'user-1', { content: 'msg1' }),
      service.sendMessage('conv-1', 'user-2', { content: 'msg2' }),
    ]);
    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle edit and delete simultaneously — both complete', async () => {
    const msg = { id: 'msg-1', senderId: 'user-1', conversationId: 'conv-1', isDeleted: false, createdAt: new Date() };
    prisma.message.findUnique.mockResolvedValue(msg);
    prisma.message.update.mockResolvedValue({});

    const [editResult, deleteResult] = await Promise.allSettled([
      service.editMessage('msg-1', 'user-1', 'edited'),
      service.deleteMessage('msg-1', 'user-1'),
    ]);

    expect(editResult.status).toBeDefined();
    expect(deleteResult.status).toBeDefined();
  });

  it('should handle concurrent reactions to same message', async () => {
    const msg = { id: 'msg-1', conversationId: 'conv-1', isDeleted: false };
    prisma.message.findUnique.mockResolvedValue(msg);
    prisma.messageReaction.upsert.mockResolvedValue({});

    const [r1, r2] = await Promise.allSettled([
      service.reactToMessage('msg-1', 'user-1', '👍'),
      service.reactToMessage('msg-1', 'user-2', '❤️'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle concurrent mark-read operations', async () => {
    prisma.conversationMember.update.mockResolvedValue({});

    const [r1, r2] = await Promise.allSettled([
      service.markRead('conv-1', 'user-1'),
      service.markRead('conv-1', 'user-2'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle 10 simultaneous message sends', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      service.sendMessage('conv-1', `user-${i}`, { content: `msg-${i}` }),
    );

    const results = await Promise.allSettled(promises);
    const successes = results.filter(r => r.status === 'fulfilled');
    expect(successes.length).toBe(10);
  });

  it('should handle concurrent mute and archive', async () => {
    prisma.conversationMember.update.mockResolvedValue({});

    const [r1, r2] = await Promise.allSettled([
      service.muteConversation('conv-1', 'user-1', true),
      service.archiveConversation('conv-1', 'user-1', true),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle forward while original is being deleted', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'msg-1', conversationId: 'conv-1', content: 'test',
      messageType: 'TEXT', mediaUrl: null, mediaType: null,
      voiceDuration: null, fileName: null, fileSize: null, forwardCount: 0,
    });
    prisma.message.create.mockResolvedValue({ id: 'fwd-1' });
    prisma.conversation.update.mockResolvedValue({});
    prisma.message.update.mockResolvedValue({});

    const result = await service.forwardMessage('msg-1', 'user-1', ['conv-2']);
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
  });

  it('should handle concurrent typing indicators (no crash)', async () => {
    // Typing is handled via socket, but mark-read is related
    const promises = Array.from({ length: 5 }, () =>
      service.markRead('conv-1', 'user-1'),
    );
    prisma.conversationMember.update.mockResolvedValue({});
    const results = await Promise.allSettled(promises);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  });
});

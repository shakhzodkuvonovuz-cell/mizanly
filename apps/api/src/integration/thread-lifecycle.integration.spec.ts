import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ThreadsService } from '../modules/threads/threads.service';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';

/**
 * Integration: Thread Lifecycle
 * Create → Get → Reply → Like → Unlike → Delete
 */
describe('Integration: Thread Lifecycle', () => {
  let threadsService: ThreadsService;
  let prisma: any;

  const mockUser = { id: 'user-1', username: 'testuser', displayName: 'Test', avatarUrl: null, isVerified: false };
  const mockThread = {
    id: 'thread-1', userId: 'user-1', content: 'Thread content', likesCount: 0,
    repostsCount: 0, repliesCount: 0, isChainHead: true, createdAt: new Date(),
    user: mockUser, replyPermission: 'EVERYONE', isRemoved: false,
  };
  const mockReply = {
    id: 'reply-1', threadId: 'thread-1', userId: 'user-1', content: 'Reply text',
    likesCount: 0, createdAt: new Date(), user: mockUser,
  };

  beforeEach(async () => {
    const prismaValue: any = {
      thread: {
        create: jest.fn().mockResolvedValue(mockThread),
        findUnique: jest.fn().mockResolvedValue(mockThread),
        findMany: jest.fn().mockResolvedValue([mockThread]),
        update: jest.fn().mockResolvedValue(mockThread),
        delete: jest.fn().mockResolvedValue(mockThread),
      },
      threadReply: {
        create: jest.fn().mockResolvedValue(mockReply),
        findMany: jest.fn().mockResolvedValue([mockReply]),
        findUnique: jest.fn().mockResolvedValue(mockReply),
        delete: jest.fn().mockResolvedValue(mockReply),
      },
      threadReaction: {
        create: jest.fn().mockResolvedValue({ userId: 'user-1', threadId: 'thread-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue({}),
      },
      threadReplyLike: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        delete: jest.fn().mockResolvedValue({}),
      },
      threadBookmark: { findUnique: jest.fn().mockResolvedValue(null) },
      repost: { findUnique: jest.fn().mockResolvedValue(null) },
      bookmark: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockResolvedValue(mockUser), findMany: jest.fn().mockResolvedValue([]) },
      follow: { findUnique: jest.fn().mockResolvedValue(null) },
      block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      mute: { findMany: jest.fn().mockResolvedValue([]) },
      hashtag: { upsert: jest.fn().mockResolvedValue({ id: 'h1' }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn().mockImplementation((fnOrArr: any) => {
        if (typeof fnOrArr === 'function') return fnOrArr(prismaValue);
        return Promise.resolve(fnOrArr);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ThreadsService,
        { provide: PrismaService, useValue: prismaValue },
      ],
    }).compile();

    threadsService = module.get(ThreadsService);
    prisma = module.get(PrismaService) as any;
  });

  it('should get a thread by id', async () => {
    const result = await threadsService.getById('thread-1', 'user-1');
    expect(result.id).toBe('thread-1');
    expect(result.content).toBe('Thread content');
  });

  it('should like a thread', async () => {
    const result = await threadsService.like('thread-1', 'user-2');
    expect(result).toHaveProperty('liked', true);
  });

  it('should unlike a thread', async () => {
    prisma.threadReaction.findUnique.mockResolvedValue({ userId: 'user-2', threadId: 'thread-1' });
    const result = await threadsService.unlike('thread-1', 'user-2');
    expect(result).toHaveProperty('liked', false);
  });

  it('should delete a thread by owner', async () => {
    await threadsService.delete('thread-1', 'user-1');
    expect(prisma.thread.update).toHaveBeenCalled();
  });

  it('should throw NotFoundException for missing thread', async () => {
    prisma.thread.findUnique.mockResolvedValue(null);
    await expect(threadsService.getById('missing', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when non-owner deletes', async () => {
    prisma.thread.findUnique.mockResolvedValue({ ...mockThread, userId: 'other-user' });
    await expect(threadsService.delete('thread-1', 'user-1')).rejects.toThrow(ForbiddenException);
  });
});

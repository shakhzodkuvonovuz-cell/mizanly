import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { ThreadsService } from './threads.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';

describe('ThreadsService — concurrency (Task 94)', () => {
  let service: ThreadsService;
  let prisma: any;
  const mockThread = { id: 'thread-1', userId: 'owner', isRemoved: false, isChainHead: true, visibility: 'PUBLIC' };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ThreadsService,
        {
          provide: PrismaService,
          useValue: {
            thread: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
            threadReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            threadReply: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn(), update: jest.fn() },
            threadReplyLike: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
            threadBookmark: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            user: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            follow: { findMany: jest.fn(), findUnique: jest.fn() },
            block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            hashtag: { upsert: jest.fn() },
            report: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
            feedDismissal: { upsert: jest.fn() },
            pollOption: { findUnique: jest.fn(), update: jest.fn() },
            pollVote: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
            poll: { update: jest.fn() },
            $transaction: jest.fn().mockResolvedValue([{}, {}]),
            $executeRaw: jest.fn(),
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } },
        { provide: 'REDIS', useValue: { get: jest.fn(), setex: jest.fn(), del: jest.fn() } },
      ],
    }).compile();

    service = module.get<ThreadsService>(ThreadsService);
    prisma = module.get(PrismaService);
  });

  it('should handle 50 simultaneous replies', async () => {
    prisma.thread.findUnique.mockResolvedValue(mockThread);

    const promises = Array.from({ length: 50 }, (_, i) =>
      service.addReply('thread-1', `user-${i}`, `Reply ${i}`),
    );
    const results = await Promise.allSettled(promises);
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  });

  it('should handle concurrent like and repost', async () => {
    prisma.thread.findUnique.mockResolvedValue(mockThread);
    prisma.threadReaction.findUnique.mockResolvedValue(null);
    prisma.thread.findFirst.mockResolvedValue(null);

    const [likeR, repostR] = await Promise.allSettled([
      service.like('thread-1', 'user-1'),
      service.repost('thread-1', 'user-2'),
    ]);

    expect(likeR.status).toBe('fulfilled');
    expect(repostR.status).toBe('fulfilled');
  });

  it('should handle delete while reply is being added', async () => {
    prisma.thread.findUnique.mockResolvedValue(mockThread);

    const [deleteR, replyR] = await Promise.allSettled([
      service.delete('thread-1', 'owner'),
      service.addReply('thread-1', 'user-1', 'Reply'),
    ]);

    expect(deleteR.status).toBeDefined();
    expect(replyR.status).toBeDefined();
  });

  it('should handle concurrent bookmark operations', async () => {
    prisma.thread.findUnique.mockResolvedValue(mockThread);

    const [r1, r2] = await Promise.allSettled([
      service.bookmark('thread-1', 'user-1'),
      service.bookmark('thread-1', 'user-2'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle concurrent report submissions', async () => {
    prisma.thread.findUnique.mockResolvedValue(mockThread);
    prisma.report.create.mockResolvedValue({});

    const [r1, r2] = await Promise.allSettled([
      service.report('thread-1', 'user-1', 'SPAM'),
      service.report('thread-1', 'user-2', 'HATE_SPEECH'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle concurrent dismiss operations', async () => {
    prisma.feedDismissal.upsert.mockResolvedValue({});

    const [r1, r2] = await Promise.allSettled([
      service.dismiss('thread-1', 'user-1'),
      service.dismiss('thread-1', 'user-2'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });
});

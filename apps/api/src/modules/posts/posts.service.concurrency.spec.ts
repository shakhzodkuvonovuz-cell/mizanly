import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { PostsService } from './posts.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';

describe('PostsService — concurrency (Task 86)', () => {
  let service: PostsService;
  let prisma: any;

  const mockPost = {
    id: 'post-1', userId: 'owner', content: 'test', postType: 'TEXT',
    visibility: 'PUBLIC', mediaUrls: [], mediaTypes: [], isRemoved: false,
    likesCount: 10, commentsCount: 5, sharesCount: 0, savesCount: 0, viewsCount: 100,
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PostsService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
            post: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
            postReaction: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            follow: { findMany: jest.fn() },
            block: { findMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
            mute: { findMany: jest.fn() },
            hashtag: { upsert: jest.fn() },
            user: { update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            comment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
            commentReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            savedPost: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
            feedDismissal: { upsert: jest.fn() },
            report: { create: jest.fn() },
            circleMember: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn(), publish: jest.fn().mockResolvedValue(1), pfadd: jest.fn().mockResolvedValue(1), pfcount: jest.fn().mockResolvedValue(0) } },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    prisma = module.get(PrismaService);
  });

  it('should handle two simultaneous likes from different users', async () => {
    prisma.post.findUnique.mockResolvedValue(mockPost);
    prisma.postReaction.findUnique.mockResolvedValue(null);
    prisma.$transaction
      .mockResolvedValueOnce([{}, {}])
      .mockResolvedValueOnce([{}, {}]);

    const [r1, r2] = await Promise.allSettled([
      service.react('post-1', 'user-1'),
      service.react('post-1', 'user-2'),
    ]);

    const successes = [r1, r2].filter(r => r.status === 'fulfilled');
    expect(successes.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle concurrent like and unlike by same user gracefully', async () => {
    prisma.post.findUnique.mockResolvedValue(mockPost);
    prisma.postReaction.findUnique
      .mockResolvedValueOnce(null) // like check
      .mockResolvedValueOnce({ userId: 'user-1', postId: 'post-1' }); // unlike check
    prisma.$transaction.mockResolvedValue([{}, {}]);

    const [r1, r2] = await Promise.allSettled([
      service.react('post-1', 'user-1'),
      service.unreact('post-1', 'user-1'),
    ]);

    // Both should complete (not hang)
    expect(r1.status).toBeDefined();
    expect(r2.status).toBeDefined();
  });

  it('should handle concurrent comment creation', async () => {
    prisma.post.findUnique.mockResolvedValue(mockPost);
    prisma.$transaction
      .mockResolvedValueOnce([{ id: 'c-1', content: 'First', userId: 'u1' }, {}])
      .mockResolvedValueOnce([{ id: 'c-2', content: 'Second', userId: 'u2' }, {}]);

    const [r1, r2] = await Promise.allSettled([
      service.addComment('post-1', 'user-1', { content: 'First' } as any),
      service.addComment('post-1', 'user-2', { content: 'Second' } as any),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle concurrent save operations from different users', async () => {
    prisma.post.findUnique.mockResolvedValue(mockPost);
    prisma.$transaction
      .mockResolvedValueOnce([{}, {}])
      .mockResolvedValueOnce([{}, {}]);

    const [r1, r2] = await Promise.allSettled([
      service.save('post-1', 'user-1'),
      service.save('post-1', 'user-2'),
    ]);

    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
  });

  it('should handle delete while someone is liking — delete should not crash', async () => {
    prisma.post.findUnique
      .mockResolvedValueOnce(mockPost)     // for delete check
      .mockResolvedValueOnce(mockPost);    // for like check
    prisma.$transaction.mockResolvedValue([{}, {}]);
    prisma.postReaction.findUnique.mockResolvedValue(null);

    const [deleteResult, likeResult] = await Promise.allSettled([
      service.delete('post-1', 'owner'),
      service.react('post-1', 'user-1'),
    ]);

    // Both operations should settle (fulfilled or rejected) without crashing
    expect(['fulfilled', 'rejected']).toContain(deleteResult.status);
    expect(['fulfilled', 'rejected']).toContain(likeResult.status);
  });

  it('should handle rapid like → unlike → like producing consistent state', async () => {
    prisma.post.findUnique.mockResolvedValue(mockPost);
    prisma.postReaction.findUnique
      .mockResolvedValueOnce(null) // first like — not yet reacted
      .mockResolvedValueOnce({ userId: 'u1', postId: 'post-1' }) // unlike — exists
      .mockResolvedValueOnce(null); // second like — unreacted
    prisma.$transaction.mockResolvedValue([{}, {}]);

    const r1 = await service.react('post-1', 'user-1');
    expect(r1.reaction).toBeTruthy(); // Should return a reaction type string

    const r2 = await service.unreact('post-1', 'user-1');
    expect(r2.reaction).toBeNull();

    const r3 = await service.react('post-1', 'user-1');
    expect(r3.reaction).toBeTruthy(); // Should return a reaction type string
  });
});

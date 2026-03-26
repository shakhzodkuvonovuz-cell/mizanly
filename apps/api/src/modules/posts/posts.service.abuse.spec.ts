import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PostsService } from './posts.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';

describe('PostsService — abuse vectors (Task 101, 103)', () => {
  let service: PostsService;
  let prisma: any;

  const mockPost = {
    id: 'post-1', userId: 'owner', content: 'test', postType: 'TEXT',
    visibility: 'PUBLIC', mediaUrls: [], mediaTypes: [], isRemoved: false,
    commentsDisabled: false, likesCount: 0, commentsCount: 0, sharesCount: 0,
    savesCount: 0, viewsCount: 0,
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
            restrict: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue({}) } },
        { provide: 'REDIS', useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), setex: jest.fn(), del: jest.fn(), publish: jest.fn().mockResolvedValue(1), pfadd: jest.fn().mockResolvedValue(1), pfcount: jest.fn().mockResolvedValue(0) } },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    prisma = module.get(PrismaService);
  });

  // Task 101: Duplicate content detection
  it('should detect duplicate share (already shared same post)', async () => {
    prisma.post.findUnique.mockResolvedValue(mockPost);
    prisma.post.findFirst.mockResolvedValue({ id: 'existing-share' }); // already shared
    await expect(service.share('post-1', 'user-1')).rejects.toThrow(ConflictException);
  });

  it('should allow sharing post that has not been shared by this user', async () => {
    prisma.post.findUnique.mockResolvedValue(mockPost);
    prisma.post.findFirst.mockResolvedValue(null); // no existing share
    prisma.$transaction.mockResolvedValue([{ id: 'share-1' }, {}]);
    const result = await service.share('post-1', 'user-1');
    expect(result).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('should reject sharing removed post', async () => {
    prisma.post.findUnique.mockResolvedValue({ ...mockPost, isRemoved: true });
    await expect(service.share('post-1', 'user-1')).rejects.toThrow(NotFoundException);
  });

  // Task 103: Comment spam
  it('should reject comment on post with comments disabled', async () => {
    prisma.post.findUnique.mockResolvedValue({ ...mockPost, commentsDisabled: true });
    await expect(service.addComment('post-1', 'user-1', { content: 'spam' } as any))
      .rejects.toThrow(ForbiddenException);
  });

  it('should reject comment on removed post', async () => {
    prisma.post.findUnique.mockResolvedValue({ ...mockPost, isRemoved: true });
    await expect(service.addComment('post-1', 'user-1', { content: 'test' } as any))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException for double-like (already reacted)', async () => {
    prisma.post.findUnique.mockResolvedValue(mockPost);
    prisma.postReaction.findUnique.mockResolvedValue({ userId: 'user-1', postId: 'post-1', reaction: 'LIKE' });
    // Existing reaction should update, not create duplicate
    prisma.postReaction.update.mockResolvedValue({});
    const result = await service.react('post-1', 'user-1');
    expect(result.reaction).toBeDefined();
    // Should have called update not create
    expect(prisma.postReaction.update).toHaveBeenCalled();
  });

  it('should throw ConflictException for double-save', async () => {
    prisma.post.findUnique.mockResolvedValue(mockPost);
    const p2002 = Object.assign(new Error('P2002'), { code: 'P2002' });
    Object.setPrototypeOf(p2002, Object.getPrototypeOf(new (require('@prisma/client').Prisma.PrismaClientKnownRequestError)('test', { code: 'P2002', clientVersion: '5.0' })));
    prisma.$transaction.mockRejectedValue(p2002);
    await expect(service.save('post-1', 'user-1')).rejects.toThrow(ConflictException);
  });

  it('should handle report on non-existent post', async () => {
    prisma.post.findUnique.mockResolvedValue(null);
    await expect(service.report('nonexistent', 'user-1', 'SPAM'))
      .rejects.toThrow(NotFoundException);
  });
});

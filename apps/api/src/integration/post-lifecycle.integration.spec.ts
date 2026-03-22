import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PostsService } from '../modules/posts/posts.service';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';

/**
 * Integration: Post Lifecycle
 * React → Unreact → Comment → Get comments → Delete → Verify gone
 */
describe('Integration: Post Lifecycle', () => {
  let postsService: PostsService;
  let prisma: any;

  const mockUser = { id: 'user-1', username: 'testuser', displayName: 'Test', avatarUrl: null, isVerified: false };
  const mockPost = {
    id: 'post-1', userId: 'user-1', content: 'Hello world', mediaUrls: [], mediaTypes: [],
    postType: 'TEXT', likesCount: 0, commentsCount: 0, createdAt: new Date(), isRemoved: false,
    user: mockUser, hashtags: [], visibility: 'PUBLIC',
  };

  beforeEach(async () => {
    const prismaValue: any = {
      post: {
        create: jest.fn().mockResolvedValue(mockPost),
        findUnique: jest.fn().mockResolvedValue(mockPost),
        findMany: jest.fn().mockResolvedValue([mockPost]),
        update: jest.fn().mockResolvedValue({ ...mockPost, likesCount: 1 }),
        delete: jest.fn().mockResolvedValue(mockPost),
      },
      postReaction: {
        create: jest.fn().mockResolvedValue({ userId: 'user-1', postId: 'post-1', reaction: 'LIKE' }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      comment: {
        create: jest.fn().mockResolvedValue({
          id: 'c1', content: 'Nice!', userId: 'user-1', postId: 'post-1',
          user: mockUser, createdAt: new Date(),
        }),
        findMany: jest.fn().mockResolvedValue([{
          id: 'c1', content: 'Nice!', userId: 'user-1', postId: 'post-1', user: mockUser,
          createdAt: new Date(), likesCount: 0, _count: { replies: 0 },
        }]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      bookmark: { findUnique: jest.fn().mockResolvedValue(null) },
      savedPost: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockResolvedValue(mockUser), findMany: jest.fn().mockResolvedValue([]) },
      follow: { findUnique: jest.fn().mockResolvedValue(null) },
      block: { findMany: jest.fn().mockResolvedValue([]) },
      mute: { findMany: jest.fn().mockResolvedValue([]) },
      hashtag: { upsert: jest.fn().mockResolvedValue({ id: 'h1' }) },
      postHashtag: { create: jest.fn().mockResolvedValue({}) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn().mockImplementation((fnOrArr: any) => {
        if (typeof fnOrArr === 'function') return fnOrArr(prismaValue);
        return Promise.resolve(fnOrArr);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PostsService,
        { provide: PrismaService, useValue: prismaValue },
      ],
    }).compile();

    postsService = module.get(PostsService);
    prisma = module.get(PrismaService) as any;
  });

  it('should react to a post with LIKE', async () => {
    const result = await postsService.react('post-1', 'user-2', 'LIKE');
    expect(result).toHaveProperty('reaction', 'LIKE');
  });

  it('should update existing reaction', async () => {
    prisma.postReaction.findUnique.mockResolvedValue({ userId: 'user-2', postId: 'post-1', reaction: 'LIKE' });
    const result = await postsService.react('post-1', 'user-2', 'LOVE');
    expect(result).toHaveProperty('reaction', 'LOVE');
    expect(prisma.postReaction.update).toHaveBeenCalled();
  });

  it('should unreact from a post', async () => {
    prisma.postReaction.findUnique.mockResolvedValue({ userId: 'user-1', postId: 'post-1', reaction: 'LIKE' });
    const result = await postsService.unreact('post-1', 'user-1');
    expect(result).toEqual({ reaction: null });
  });

  it('should handle unreact when not reacted (idempotent)', async () => {
    prisma.postReaction.findUnique.mockResolvedValue(null);
    const result = await postsService.unreact('post-1', 'user-1');
    expect(result).toEqual({ reaction: null });
  });

  it('should add a comment to a post', async () => {
    const result = await postsService.addComment('post-1', 'user-1', { content: 'Nice!' } as any);
    expect(result.content).toBe('Nice!');
    expect(prisma.comment.create).toHaveBeenCalled();
  });

  it('should get comments for a post', async () => {
    const result = await postsService.getComments('post-1');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].content).toBe('Nice!');
  });

  it('should soft-delete a post by owner', async () => {
    await postsService.delete('post-1', 'user-1');
    expect(prisma.post.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'post-1' },
      data: expect.objectContaining({ isRemoved: true }),
    }));
  });

  it('should throw NotFoundException when deleting missing post', async () => {
    prisma.post.findUnique.mockResolvedValue(null);
    await expect(postsService.delete('post-1', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException when non-owner deletes', async () => {
    prisma.post.findUnique.mockResolvedValue({ ...mockPost, userId: 'other-user' });
    await expect(postsService.delete('post-1', 'user-1')).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException when reacting to removed post', async () => {
    prisma.post.findUnique.mockResolvedValue({ ...mockPost, isRemoved: true });
    await expect(postsService.react('post-1', 'user-1')).rejects.toThrow(NotFoundException);
  });
});

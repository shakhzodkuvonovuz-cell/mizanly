import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PostsService } from './posts.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { NotificationsService } from '../notifications/notifications.service';

describe('PostsService — authorization matrix', () => {
  let service: PostsService;
  let prisma: any;

  const userA = 'user-a-id';
  const userB = 'user-b-id';

  const mockPostByA = {
    id: 'post-1',
    userId: userA,
    content: 'Test post',
    postType: 'TEXT',
    visibility: 'PUBLIC',
    mediaUrls: [],
    mediaTypes: [],
    isRemoved: false,
    commentsDisabled: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PostsService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            $executeRaw: jest.fn(),
            post: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
            postReaction: {
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
            },
            follow: { findMany: jest.fn() },
            block: { findMany: jest.fn() },
            mute: { findMany: jest.fn() },
            hashtag: { upsert: jest.fn() },
            user: { update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            comment: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              findMany: jest.fn(),
            },
            commentReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            savedPost: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              upsert: jest.fn(),
            },
            feedDismissal: { upsert: jest.fn() },
            report: { create: jest.fn() },
            circleMember: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn(), notifyLike: jest.fn(), notifyComment: jest.fn() },
        },
        {
          provide: 'REDIS',
          useValue: { get: jest.fn().mockResolvedValue(null), setex: jest.fn(), del: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    prisma = module.get(PrismaService);
  });

  describe('update — ownership check', () => {
    it('should allow owner to update their own post', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPostByA);
      prisma.post.update.mockResolvedValue({ ...mockPostByA, content: 'updated' });

      const result = await service.update('post-1', userA, { content: 'updated' });
      expect(result.content).toBe('updated');
    });

    it('should throw ForbiddenException when non-owner tries to update', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPostByA);

      await expect(service.update('post-1', userB, { content: 'hacked' }))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete — ownership check', () => {
    it('should allow owner to delete their own post', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPostByA);
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.delete('post-1', userA);
      expect(result.deleted).toBe(true);
    });

    it('should throw ForbiddenException when non-owner tries to delete', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPostByA);

      await expect(service.delete('post-1', userB))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteComment — ownership check', () => {
    it('should allow comment author to delete their comment', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'comment-1', userId: userA, postId: 'post-1' });
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.deleteComment('comment-1', userA);
      expect(result.deleted).toBe(true);
    });

    it('should throw ForbiddenException when non-author tries to delete comment', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'comment-1', userId: userA, postId: 'post-1' });

      await expect(service.deleteComment('comment-1', userB))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('editComment — ownership check', () => {
    it('should allow comment author to edit', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'c-1', userId: userA, isRemoved: false });
      prisma.comment.update.mockResolvedValue({ id: 'c-1', content: 'edited' });

      const result = await service.editComment('c-1', userA, 'edited');
      expect(result.content).toBe('edited');
    });

    it('should throw ForbiddenException when non-author edits comment', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'c-1', userId: userA, isRemoved: false });

      await expect(service.editComment('c-1', userB, 'hacked'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('pinComment — ownership check', () => {
    it('should allow post owner to pin a comment', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPostByA);
      prisma.comment.findUnique.mockResolvedValue({ id: 'c-1', postId: 'post-1' });
      prisma.comment.updateMany.mockResolvedValue({});
      prisma.comment.update.mockResolvedValue({ id: 'c-1', isPinned: true });

      const result = await service.pinComment('post-1', 'c-1', userA);
      expect(result.isPinned).toBe(true);
    });

    it('should throw ForbiddenException when non-owner tries to pin', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPostByA);

      await expect(service.pinComment('post-1', 'c-1', userB))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('hideComment — ownership check', () => {
    it('should allow post owner to hide comments', async () => {
      prisma.comment.findUnique.mockResolvedValue({
        id: 'c-1', post: { userId: userA },
      });
      prisma.comment.update.mockResolvedValue({ id: 'c-1', isHidden: true });

      const result = await service.hideComment('c-1', userA);
      expect(result.isHidden).toBe(true);
    });

    it('should throw ForbiddenException when non-post-owner hides comment', async () => {
      prisma.comment.findUnique.mockResolvedValue({
        id: 'c-1', post: { userId: userA },
      });

      await expect(service.hideComment('c-1', userB))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('archivePost — ownership check', () => {
    it('should throw ForbiddenException when non-owner archives', async () => {
      prisma.post.findUnique.mockResolvedValue(mockPostByA);

      await expect(service.archivePost('post-1', userB))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('getById — access control', () => {
    it('should throw NotFoundException for removed post', async () => {
      prisma.post.findUnique.mockResolvedValue({ ...mockPostByA, isRemoved: true });

      await expect(service.getById('post-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(service.getById('nonexistent'))
        .rejects.toThrow(NotFoundException);
    });
  });
});

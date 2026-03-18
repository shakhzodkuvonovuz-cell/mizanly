import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { PostsService } from './posts.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PostsService', () => {
  let service: PostsService;
  let prisma: any;
  let redis: jest.Mocked<Redis>;
  let notifications: jest.Mocked<NotificationsService>;

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
            $queryRaw: jest.fn(),
            post: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
            },
            like: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
            },
            postReaction: {
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
              delete: jest.fn(),
            },
            follow: {
              findMany: jest.fn(),
            },
            block: {
              findMany: jest.fn(),
            },
            mute: {
              findMany: jest.fn(),
            },
            hashtag: {
              upsert: jest.fn(),
            },
            user: {
              update: jest.fn(),
            },
            comment: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              findMany: jest.fn(),
            },
            commentReaction: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
            },
            savedPost: {
              create: jest.fn(),
              delete: jest.fn(),
              findUnique: jest.fn(),
            },
            feedDismissal: {
              upsert: jest.fn(),
            },
            report: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            notifyLike: jest.fn(),
            notifyComment: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    prisma = module.get(PrismaService) as any;
    redis = module.get('REDIS');
    notifications = module.get(NotificationsService);
  });

  describe('createPost', () => {
    it('should create a post and increment postsCount', async () => {
      const userId = 'user-123';
      const dto = {
        postType: 'TEXT',
        content: 'Hello world',
        visibility: 'PUBLIC',
      };
      const mockPost = {
        id: 'post-456',
        userId,
        ...dto,
        mediaUrls: [],
        mediaTypes: [],
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        savesCount: 0,
        viewsCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.post.create.mockResolvedValue(mockPost);
      prisma.user.update.mockResolvedValue(undefined);
      prisma.hashtag.upsert.mockResolvedValue({} as any);
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn({
          post: { create: jest.fn().mockResolvedValue(mockPost) },
          user: { update: jest.fn().mockResolvedValue(undefined) },
          hashtag: { upsert: jest.fn().mockResolvedValue({}) },
        });
      });

      const result = await service.create(userId, dto);

      // Post creation now happens inside an interactive $transaction
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.id).toBe('post-456');
      expect(result).toEqual(mockPost);
    });
  });

  describe('deletePost', () => {
    it('should soft-delete and decrement postsCount', async () => {
      const userId = 'user-123';
      const postId = 'post-456';
      const mockPost = {
        id: postId,
        userId,
        isRemoved: false,
      };
      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.post.update.mockResolvedValue({
        ...mockPost,
        isRemoved: true,
        removedAt: new Date(),
        removedById: userId,
      });
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.$transaction.mockResolvedValue([undefined, undefined]);

      await service.delete(postId, userId);

      expect(prisma.post.findUnique).toHaveBeenCalledWith({ where: { id: postId } });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: postId },
        data: { isRemoved: true, removedAt: expect.any(Date), removedById: userId },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not the author', async () => {
      const userId = 'user-123';
      const postId = 'post-456';
      const mockPost = {
        id: postId,
        userId: 'different-user',
        isRemoved: false,
      };
      prisma.post.findUnique.mockResolvedValue(mockPost);

      await expect(service.delete(postId, userId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if post does not exist', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(service.delete('post-456', 'user-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('likePost', () => {
    it('should create a like record and increment likesCount', async () => {
      const userId = 'user-123';
      const postId = 'post-456';
      const mockPost = {
        id: postId,
        userId: 'post-owner',
        likesCount: 5,
      };
      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.postReaction.findUnique.mockResolvedValue(null);
      prisma.postReaction.create.mockResolvedValue({} as any);
      prisma.post.update.mockResolvedValue({ ...mockPost, likesCount: 6 });
      prisma.$transaction.mockResolvedValue([undefined, undefined]);
      notifications.create.mockResolvedValue({} as any);

      await service.react(postId, userId, 'LIKE');

      expect(prisma.postReaction.create).toHaveBeenCalledWith({
        data: {
          userId,
          postId,
          reaction: 'LIKE',
        },
      });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: postId },
        data: { likesCount: { increment: 1 } },
      });
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'post-owner',
        actorId: userId,
        type: 'LIKE',
        postId,
      });
    });
  });

  describe('unlikePost', () => {
    it('should delete the like record and decrement likesCount', async () => {
      const userId = 'user-123';
      const postId = 'post-456';
      const mockLike = {
        userId,
        postId,
        reaction: 'LIKE',
      };
      prisma.postReaction.findUnique.mockResolvedValue(mockLike);
      prisma.postReaction.delete.mockResolvedValue({} as any);
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.$transaction.mockResolvedValue([undefined, undefined]);

      await service.unreact(postId, userId);

      expect(prisma.postReaction.delete).toHaveBeenCalledWith({
        where: { userId_postId: { userId, postId } },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('getFeed', () => {
    it('should exclude blocked and muted users', async () => {
      const userId = 'user-123';
      const blockedId = 'user-blocked';
      const mutedId = 'user-muted';
      const followingId = 'user-following';
      prisma.follow.findMany.mockResolvedValue([
        { followingId },
      ]);
      prisma.block.findMany.mockResolvedValue([
        { blockedId },
      ]);
      prisma.mute.findMany.mockResolvedValue([
        { mutedId },
      ]);
      prisma.post.findMany.mockResolvedValue([]);

      await service.getFeed(userId, 'following');

      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: { in: [userId, followingId], notIn: [blockedId, mutedId] },
        }),
        select: expect.any(Object),
        take: 21,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should cache "for you" feed', async () => {
      const userId = 'user-123';
      const cachedData = {
        data: [],
        meta: { cursor: null, hasMore: false },
      };
      redis.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.getFeed(userId, 'foryou');

      expect(redis.get).toHaveBeenCalledWith('feed:foryou:user-123:first');
      expect(prisma.post.findMany).not.toHaveBeenCalled();
      expect(result).toEqual(cachedData);
    });
  });

  describe('getById', () => {
    it('should return post with userReaction and isSaved when viewerId provided', async () => {
      const postId = 'post-456';
      const viewerId = 'user-123';
      const mockPost = {
        id: postId,
        content: 'Test post',
        user: { id: 'owner', username: 'owner' },
        isRemoved: false,
      };
      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.postReaction.findUnique.mockResolvedValue({ reaction: 'LIKE' });
      prisma.savedPost.findUnique.mockResolvedValue(null);

      const result = await service.getById(postId, viewerId);

      expect(prisma.post.findUnique).toHaveBeenCalledWith({
        where: { id: postId },
        select: expect.any(Object),
      });
      expect(result).toEqual({
        ...mockPost,
        userReaction: 'LIKE',
        isSaved: false,
      });
    });

    it('should return post without userReaction and isSaved when viewerId not provided', async () => {
      const postId = 'post-456';
      const mockPost = {
        id: postId,
        content: 'Test post',
        user: { id: 'owner', username: 'owner' },
        isRemoved: false,
      };
      prisma.post.findUnique.mockResolvedValue(mockPost);

      const result = await service.getById(postId);

      expect(prisma.post.findUnique).toHaveBeenCalledWith({
        where: { id: postId },
        select: expect.any(Object),
      });
      expect(result).toEqual({
        ...mockPost,
        userReaction: null,
        isSaved: false,
      });
    });

    it('should throw NotFoundException if post is removed', async () => {
      const postId = 'post-456';
      const mockPost = {
        id: postId,
        isRemoved: true,
      };
      prisma.post.findUnique.mockResolvedValue(mockPost);

      await expect(service.getById(postId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update post if user is author', async () => {
      const postId = 'post-456';
      const userId = 'user-123';
      const mockPost = {
        id: postId,
        userId,
        isRemoved: false,
      };
      const updateData = { content: 'Updated content' };
      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.post.update.mockResolvedValue({ ...mockPost, ...updateData });

      const result = await service.update(postId, userId, updateData);

      expect(prisma.post.findUnique).toHaveBeenCalledWith({ where: { id: postId } });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: postId },
        data: { content: updateData.content },
        select: expect.any(Object),
      });
      expect(result).toEqual({ ...mockPost, ...updateData });
    });

    it('should throw ForbiddenException if user is not author', async () => {
      const postId = 'post-456';
      const userId = 'user-123';
      const mockPost = {
        id: postId,
        userId: 'different-user',
        isRemoved: false,
      };
      prisma.post.findUnique.mockResolvedValue(mockPost);

      await expect(service.update(postId, userId, {})).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if post not found', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(service.update('post-456', 'user-123', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if post is removed', async () => {
      const postId = 'post-456';
      const userId = 'user-123';
      const mockPost = {
        id: postId,
        userId,
        isRemoved: true,
      };
      prisma.post.findUnique.mockResolvedValue(mockPost);

      await expect(service.update(postId, userId, {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('save', () => {
    it('should save post and increment savesCount', async () => {
      const postId = 'post-456';
      const userId = 'user-123';
      const mockPost = {
        id: postId,
        userId: 'owner',
        isRemoved: false,
      };
      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.savedPost.create.mockResolvedValue({});
      prisma.post.update.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.save(postId, userId);

      expect(prisma.post.findUnique).toHaveBeenCalledWith({ where: { id: postId } });
      expect(prisma.savedPost.create).toHaveBeenCalledWith({ data: { userId, postId } });
      expect(prisma.post.update).toHaveBeenCalledWith({ where: { id: postId }, data: { savesCount: { increment: 1 } } });
      expect(result).toEqual({ saved: true });
    });

    it('should throw NotFoundException if post not found', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(service.save('post-456', 'user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if post is removed', async () => {
      const mockPost = { id: 'post-456', isRemoved: true };
      prisma.post.findUnique.mockResolvedValue(mockPost);

      await expect(service.save('post-456', 'user-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unsave', () => {
    it('should unsave post and decrement savesCount', async () => {
      const postId = 'post-456';
      const userId = 'user-123';
      const mockSaved = { userId, postId };
      prisma.savedPost.findUnique.mockResolvedValue(mockSaved);
      prisma.savedPost.delete.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.unsave(postId, userId);

      expect(prisma.savedPost.findUnique).toHaveBeenCalledWith({
        where: { userId_postId: { userId, postId } },
      });
      expect(prisma.savedPost.delete).toHaveBeenCalledWith({
        where: { userId_postId: { userId, postId } },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(result).toEqual({ saved: false });
    });

    it('should throw NotFoundException if save not found', async () => {
      prisma.savedPost.findUnique.mockResolvedValue(null);

      await expect(service.unsave('post-456', 'user-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('share', () => {
    it('should create shared post and increment sharesCount', async () => {
      const postId = 'post-456';
      const userId = 'user-123';
      const content = 'Check this out';
      const mockOriginal = {
        id: postId,
        userId: 'owner',
        isRemoved: false,
      };
      const mockShared = {
        id: 'shared-789',
        userId,
        postType: 'TEXT',
        content,
        sharedPostId: postId,
      };
      prisma.post.findUnique.mockResolvedValue(mockOriginal);
      prisma.post.create.mockResolvedValue(mockShared);
      prisma.post.update.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([mockShared, {}]);

      const result = await service.share(postId, userId, content);

      expect(prisma.post.findUnique).toHaveBeenCalledWith({ where: { id: postId } });
      expect(prisma.post.create).toHaveBeenCalledWith({
        data: {
          userId,
          postType: 'TEXT',
          content,
          sharedPostId: postId,
          visibility: 'PUBLIC',
        },
        select: expect.any(Object),
      });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: postId },
        data: { sharesCount: { increment: 1 } },
      });
      expect(result).toEqual(mockShared);
    });

    it('should throw NotFoundException if original post not found', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(service.share('post-456', 'user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if original post is removed', async () => {
      const mockOriginal = { id: 'post-456', isRemoved: true };
      prisma.post.findUnique.mockResolvedValue(mockOriginal);

      await expect(service.share('post-456', 'user-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getComments', () => {
    it('should return comments with pagination', async () => {
      const postId = 'post-456';
      const cursor = 'comment-10';
      const limit = 20;
      const mockComments = [
        {
          id: 'comment-11',
          content: 'Great post',
          user: { id: 'user-123', username: 'user' },
          _count: { replies: 2 },
        },
      ];
      prisma.comment.findMany.mockResolvedValue(mockComments);

      const result = await service.getComments(postId, cursor, limit);

      expect(prisma.comment.findMany).toHaveBeenCalledWith({
        where: { postId, parentId: null, isRemoved: false },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              isVerified: true,
            },
          },
          _count: { select: { replies: true } },
        },
        take: limit + 1,
        cursor: { id: cursor },
        skip: 1,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual({
        data: mockComments.slice(0, limit),
        meta: { cursor: null, hasMore: false },
      });
    });
  });

  describe('addComment', () => {
    it('should add comment and increment commentsCount', async () => {
      const postId = 'post-456';
      const userId = 'user-123';
      const dto = { content: 'Nice post!' };
      const mockPost = { id: postId, userId: 'owner', commentsDisabled: false, isRemoved: false };
      const mockComment = {
        id: 'comment-789',
        content: dto.content,
        user: { id: userId, username: 'user' },
      };
      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.comment.create.mockResolvedValue(mockComment);
      prisma.post.update.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([mockComment, {}]);
      notifications.create.mockResolvedValue({} as any);

      const result = await service.addComment(postId, userId, dto);

      expect(prisma.post.findUnique).toHaveBeenCalledWith({ where: { id: postId } });
      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: {
          userId,
          postId,
          content: dto.content,
          parentId: undefined,
          mentions: [],
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              isVerified: true,
            },
          },
        },
      });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: postId },
        data: { commentsCount: { increment: 1 } },
      });
      expect(notifications.create).toHaveBeenCalledWith({
        userId: 'owner',
        actorId: userId,
        type: 'COMMENT',
        postId,
        commentId: mockComment.id,
        body: dto.content.substring(0, 100),
      });
      expect(result).toEqual(mockComment);
    });

    it('should throw NotFoundException if post not found', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(service.addComment('post-456', 'user-123', { content: 'test' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if comments disabled', async () => {
      const mockPost = { id: 'post-456', commentsDisabled: true, isRemoved: false };
      prisma.post.findUnique.mockResolvedValue(mockPost);

      await expect(service.addComment('post-456', 'user-123', { content: 'test' })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('editComment', () => {
    it('should edit comment if user is author', async () => {
      const commentId = 'comment-456';
      const userId = 'user-123';
      const content = 'Updated comment';
      const mockComment = {
        id: commentId,
        userId,
        isRemoved: false,
      };
      prisma.comment.findUnique.mockResolvedValue(mockComment);
      prisma.comment.update.mockResolvedValue({ ...mockComment, content });

      const result = await service.editComment(commentId, userId, content);

      expect(prisma.comment.findUnique).toHaveBeenCalledWith({ where: { id: commentId } });
      expect(prisma.comment.update).toHaveBeenCalledWith({
        where: { id: commentId },
        data: { content },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      });
      expect(result).toEqual({ ...mockComment, content });
    });

    it('should throw NotFoundException if comment not found', async () => {
      prisma.comment.findUnique.mockResolvedValue(null);

      await expect(service.editComment('comment-456', 'user-123', 'content')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not author', async () => {
      const mockComment = { id: 'comment-456', userId: 'different-user', isRemoved: false };
      prisma.comment.findUnique.mockResolvedValue(mockComment);

      await expect(service.editComment('comment-456', 'user-123', 'content')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if comment is removed', async () => {
      const mockComment = { id: 'comment-456', userId: 'user-123', isRemoved: true };
      prisma.comment.findUnique.mockResolvedValue(mockComment);

      await expect(service.editComment('comment-456', 'user-123', 'content')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteComment', () => {
    it('should soft-delete comment and decrement commentsCount', async () => {
      const commentId = 'comment-456';
      const userId = 'user-123';
      const mockComment = {
        id: commentId,
        userId,
        postId: 'post-789',
      };
      prisma.comment.findUnique.mockResolvedValue(mockComment);
      prisma.comment.update.mockResolvedValue({ ...mockComment, isRemoved: true });
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.deleteComment(commentId, userId);

      expect(prisma.comment.findUnique).toHaveBeenCalledWith({ where: { id: commentId } });
      expect(prisma.comment.update).toHaveBeenCalledWith({
        where: { id: commentId },
        data: { isRemoved: true },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(result).toEqual({ deleted: true });
    });

    it('should throw NotFoundException if comment not found', async () => {
      prisma.comment.findUnique.mockResolvedValue(null);

      await expect(service.deleteComment('comment-456', 'user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not author', async () => {
      const mockComment = { id: 'comment-456', userId: 'different-user' };
      prisma.comment.findUnique.mockResolvedValue(mockComment);

      await expect(service.deleteComment('comment-456', 'user-123')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('likeComment', () => {
    it('should like comment and increment likesCount', async () => {
      const commentId = 'comment-456';
      const userId = 'user-123';
      const mockComment = { id: commentId };
      prisma.comment.findUnique.mockResolvedValue(mockComment);
      prisma.commentReaction.findUnique.mockResolvedValue(null);
      prisma.commentReaction.create.mockResolvedValue({});
      prisma.comment.update.mockResolvedValue({});
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.likeComment(commentId, userId);

      expect(prisma.comment.findUnique).toHaveBeenCalledWith({ where: { id: commentId } });
      expect(prisma.commentReaction.create).toHaveBeenCalledWith({
        data: { userId, commentId, reaction: 'LIKE' },
      });
      expect(prisma.comment.update).toHaveBeenCalledWith({
        where: { id: commentId },
        data: { likesCount: { increment: 1 } },
      });
      expect(result).toEqual({ liked: true });
    });

    it('should throw NotFoundException if comment not found', async () => {
      prisma.comment.findUnique.mockResolvedValue(null);

      await expect(service.likeComment('comment-456', 'user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if already reacted', async () => {
      const mockComment = { id: 'comment-456' };
      const mockReaction = { userId: 'user-123', commentId: 'comment-456' };
      prisma.comment.findUnique.mockResolvedValue(mockComment);
      prisma.commentReaction.findUnique.mockResolvedValue(mockReaction);

      await expect(service.likeComment('comment-456', 'user-123')).rejects.toThrow(ConflictException);
    });
  });

  describe('unlikeComment', () => {
    it('should unlike comment and decrement likesCount', async () => {
      const commentId = 'comment-456';
      const userId = 'user-123';
      const mockReaction = { userId, commentId };
      prisma.commentReaction.findUnique.mockResolvedValue(mockReaction);
      prisma.commentReaction.delete.mockResolvedValue({});
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.unlikeComment(commentId, userId);

      expect(prisma.commentReaction.findUnique).toHaveBeenCalledWith({
        where: { userId_commentId: { userId, commentId } },
      });
      expect(prisma.commentReaction.delete).toHaveBeenCalledWith({
        where: { userId_commentId: { userId, commentId } },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(result).toEqual({ liked: false });
    });

    it('should throw NotFoundException if reaction not found', async () => {
      prisma.commentReaction.findUnique.mockResolvedValue(null);

      await expect(service.unlikeComment('comment-456', 'user-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('report', () => {
    it('should create report', async () => {
      const postId = 'post-456';
      const userId = 'user-123';
      const reason = 'SPAM';
      prisma.post.findUnique.mockResolvedValue({ id: postId, isRemoved: false });
      prisma.report.create.mockResolvedValue({} as any);

      const result = await service.report(postId, userId, reason);

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId: userId,
          reportedPostId: postId,
          reason: 'SPAM',
        },
      });
      expect(result).toEqual({ reported: true });
    });
  });

  describe('dismiss', () => {
    it('should create feed dismissal', async () => {
      const postId = 'post-456';
      const userId = 'user-123';
      prisma.feedDismissal.upsert.mockResolvedValue({} as any);

      const result = await service.dismiss(postId, userId);

      expect(prisma.feedDismissal.upsert).toHaveBeenCalledWith({
        where: { userId_contentId_contentType: { userId, contentId: postId, contentType: 'POST' } },
        create: { userId, contentId: postId, contentType: 'POST' },
        update: {},
      });
      expect(result).toEqual({ dismissed: true });
    });
  });

});
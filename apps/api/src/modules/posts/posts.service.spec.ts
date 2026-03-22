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
              findFirst: jest.fn(),
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
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
            },
            follow: {
              findMany: jest.fn(),
            },
            block: {
              findMany: jest.fn().mockResolvedValue([]),
              findFirst: jest.fn().mockResolvedValue(null),
            },
            mute: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            hashtag: {
              upsert: jest.fn(),
            },
            report: {
              create: jest.fn().mockResolvedValue({}),
              findFirst: jest.fn().mockResolvedValue(null),
            },
            feedDismissal: {
              findMany: jest.fn().mockResolvedValue([]),
              upsert: jest.fn(),
            },
            user: {
              update: jest.fn(),
            },
            comment: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
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
              findMany: jest.fn().mockResolvedValue([]),
              upsert: jest.fn(),
            },
            circleMember: {
              findMany: jest.fn().mockResolvedValue([]),
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
      const followingId = 'user-following';
      prisma.follow.findMany.mockResolvedValue([
        { followingId },
      ]);
      prisma.block.findMany.mockResolvedValue([
        { blockedId: 'user-blocked' },
      ]);
      prisma.mute.findMany.mockResolvedValue([
        { mutedId: 'user-muted' },
      ]);
      prisma.post.findMany.mockResolvedValue([]);

      await service.getFeed(userId, 'following');

      // Verify the userId.in list does NOT include blocked/muted users
      const callArgs = prisma.post.findMany.mock.calls[0][0];
      const userIds = callArgs.where.userId.in;
      expect(userIds).toContain(userId);
      expect(userIds).toContain(followingId);
      expect(userIds).not.toContain('user-blocked');
      expect(userIds).not.toContain('user-muted');
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
        data: expect.objectContaining({ content: updateData.content }),
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

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ postId, parentId: null, isRemoved: false }),
          take: limit + 1,
          cursor: { id: cursor },
          skip: 1,
          orderBy: { createdAt: 'desc' },
        }),
      );
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
        data: expect.objectContaining({ content }),
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
        post: { userId: 'post-owner-1' },
      };
      prisma.comment.findUnique.mockResolvedValue(mockComment);
      prisma.comment.update.mockResolvedValue({ ...mockComment, isRemoved: true });
      prisma.$executeRaw.mockResolvedValue(1);
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.deleteComment(commentId, userId);

      expect(prisma.comment.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: commentId }, include: expect.any(Object) }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
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

  // ═══════════════════════════════════════════════════════
  // NEW TESTS — react error paths
  // ═══════════════════════════════════════════════════════

  describe('react — error paths', () => {
    it('should throw NotFoundException if post not found', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.react('post-456', 'user-123', 'LIKE')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if post is removed', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-456', isRemoved: true });
      await expect(service.react('post-456', 'user-123', 'LIKE')).rejects.toThrow(NotFoundException);
    });

    it('should update reaction type when already reacted (not error)', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-456', userId: 'owner', isRemoved: false });
      prisma.postReaction.findUnique.mockResolvedValue({ userId: 'user-123', postId: 'post-456', reaction: 'LIKE' });
      prisma.postReaction.update.mockResolvedValue({ reaction: 'LOVE' });

      const result = await service.react('post-456', 'user-123', 'LOVE');
      expect(result).toEqual({ reaction: 'LOVE' });
      expect(prisma.postReaction.update).toHaveBeenCalled();
    });
  });

  describe('unreact — behavior', () => {
    it('should return null reaction idempotently when no existing reaction', async () => {
      prisma.postReaction.findUnique.mockResolvedValue(null);
      const result = await service.unreact('post-456', 'user-123');
      expect(result).toEqual({ reaction: null });
    });
  });

  // ═══════════════════════════════════════════════════════
  // getById additional
  // ═══════════════════════════════════════════════════════

  describe('getById — additional', () => {
    it('should throw NotFoundException if post not found', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should return post with isSaved=true when user has saved', async () => {
      const mockPost = { id: 'post-456', content: 'Test', user: { id: 'owner' }, isRemoved: false };
      prisma.post.findUnique.mockResolvedValue(mockPost);
      prisma.postReaction.findUnique.mockResolvedValue(null);
      prisma.savedPost.findUnique.mockResolvedValue({ userId: 'user-1', postId: 'post-456' });

      const result = await service.getById('post-456', 'user-1');
      expect(result.isSaved).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getFeed — zero follows fallback
  // ═══════════════════════════════════════════════════════

  describe('getFeed — zero follows fallback', () => {
    it('should return empty trending fallback when user has zero follows and no content', async () => {
      prisma.follow.findMany.mockResolvedValue([]);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([]);
      prisma.postReaction.findUnique.mockResolvedValue(null);
      prisma.savedPost.findUnique.mockResolvedValue(null);

      const result = await service.getFeed('user-123', 'following');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should return posts with cursor-based pagination', async () => {
      prisma.follow.findMany.mockResolvedValue(
        Array(15).fill(null).map((_, i) => ({ followingId: `following-${i}` })),
      );
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([
        { id: 'post-1', createdAt: new Date(), likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0, viewsCount: 0, user: { id: 'u1' } },
      ]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.savedPost.findMany.mockResolvedValue([]);

      const result = await service.getFeed('user-123', 'following', 'cursor-abc', 5);
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getFeed — foryou', () => {
    it('should return empty array and cache the result when no posts in DB', async () => {
      redis.get.mockResolvedValue(null);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([]);
      prisma.postReaction.findMany.mockResolvedValue([]);
      prisma.savedPost.findMany.mockResolvedValue([]);

      const result = await service.getFeed('user-123', 'foryou');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
      // Should have attempted to cache the result
      expect(redis.setex).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════
  // Archive
  // ═══════════════════════════════════════════════════════

  describe('archivePost', () => {
    it('should archive post for owner', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', userId: 'user-1', isRemoved: false });
      prisma.savedPost.upsert.mockResolvedValue({});

      const result = await service.archivePost('post-1', 'user-1');
      expect(result).toEqual({ archived: true });
    });

    it('should throw NotFoundException when post not found', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.archivePost('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when post is removed', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', isRemoved: true });
      await expect(service.archivePost('post-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not owner', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', userId: 'other', isRemoved: false });
      await expect(service.archivePost('post-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('unarchivePost', () => {
    it('should unarchive post', async () => {
      prisma.savedPost.findUnique.mockResolvedValue({ userId: 'user-1', postId: 'post-1', collectionName: 'archive' });
      prisma.savedPost.delete.mockResolvedValue({});

      const result = await service.unarchivePost('post-1', 'user-1');
      expect(result).toEqual({ archived: false });
    });

    it('should throw NotFoundException when not archived', async () => {
      prisma.savedPost.findUnique.mockResolvedValue(null);
      await expect(service.unarchivePost('post-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when saved but not as archive', async () => {
      prisma.savedPost.findUnique.mockResolvedValue({ userId: 'user-1', postId: 'post-1', collectionName: 'default' });
      await expect(service.unarchivePost('post-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getArchived', () => {
    it('should return archived posts with pagination', async () => {
      prisma.savedPost.findMany.mockResolvedValue([
        { post: { id: 'post-1', content: 'Test' }, postId: 'post-1' },
      ]);

      const result = await service.getArchived('user-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Pin/Unpin Comment
  // ═══════════════════════════════════════════════════════

  describe('pinComment', () => {
    it('should pin comment on own post', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', userId: 'user-1' });
      prisma.comment.findUnique.mockResolvedValue({ id: 'comment-1', postId: 'post-1' });
      prisma.comment.updateMany.mockResolvedValue({ count: 0 });
      prisma.comment.update.mockResolvedValue({ id: 'comment-1', isPinned: true });

      const result = await service.pinComment('post-1', 'comment-1', 'user-1');
      expect(result.isPinned).toBe(true);
    });

    it('should throw NotFoundException when post not found', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.pinComment('post-1', 'comment-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not post owner', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', userId: 'other' });
      await expect(service.pinComment('post-1', 'comment-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when comment not found', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', userId: 'user-1' });
      prisma.comment.findUnique.mockResolvedValue(null);
      await expect(service.pinComment('post-1', 'comment-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when comment belongs to different post', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', userId: 'user-1' });
      prisma.comment.findUnique.mockResolvedValue({ id: 'comment-1', postId: 'post-2' });
      await expect(service.pinComment('post-1', 'comment-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unpinComment', () => {
    it('should unpin comment', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', userId: 'user-1' });
      prisma.comment.findUnique.mockResolvedValue({ id: 'comment-1', postId: 'post-1' });
      prisma.comment.update.mockResolvedValue({ id: 'comment-1', isPinned: false });

      const result = await service.unpinComment('post-1', 'comment-1', 'user-1');
      expect(result.isPinned).toBe(false);
    });

    it('should throw ForbiddenException when not post owner', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', userId: 'other' });
      await expect(service.unpinComment('post-1', 'comment-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Hide/Unhide Comment
  // ═══════════════════════════════════════════════════════

  describe('hideComment', () => {
    it('should hide comment as post owner', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'comment-1', post: { userId: 'user-1' } });
      prisma.comment.update.mockResolvedValue({ id: 'comment-1', isHidden: true });

      const result = await service.hideComment('comment-1', 'user-1');
      expect(result.isHidden).toBe(true);
    });

    it('should throw NotFoundException when comment not found', async () => {
      prisma.comment.findUnique.mockResolvedValue(null);
      await expect(service.hideComment('comment-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not post owner', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'comment-1', post: { userId: 'other' } });
      await expect(service.hideComment('comment-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('unhideComment', () => {
    it('should unhide comment as post owner', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'comment-1', post: { userId: 'user-1' } });
      prisma.comment.update.mockResolvedValue({ id: 'comment-1', isHidden: false });

      const result = await service.unhideComment('comment-1', 'user-1');
      expect(result.isHidden).toBe(false);
    });

    it('should throw ForbiddenException when not post owner', async () => {
      prisma.comment.findUnique.mockResolvedValue({ id: 'comment-1', post: { userId: 'other' } });
      await expect(service.unhideComment('comment-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getHiddenComments', () => {
    it('should return hidden comments for post owner', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', userId: 'user-1' });
      prisma.comment.findMany.mockResolvedValue([
        { id: 'c-1', content: 'hidden', isHidden: true },
      ]);

      const result = await service.getHiddenComments('post-1', 'user-1');
      expect(result.data).toHaveLength(1);
    });

    it('should throw NotFoundException when post not found', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.getHiddenComments('post-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when not post owner', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', userId: 'other' });
      await expect(service.getHiddenComments('post-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // Share Link
  // ═══════════════════════════════════════════════════════

  describe('getShareLink', () => {
    it('should return share URL for existing post', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', isRemoved: false });
      const result = await service.getShareLink('post-1');
      expect(result.url).toContain('post-1');
    });

    it('should throw NotFoundException for removed post', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-1', isRemoved: true });
      await expect(service.getShareLink('post-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for nonexistent post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.getShareLink('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // addComment — additional
  // ═══════════════════════════════════════════════════════

  describe('addComment — additional', () => {
    it('should throw NotFoundException if post is removed', async () => {
      prisma.post.findUnique.mockResolvedValue({ id: 'post-456', isRemoved: true });
      await expect(service.addComment('post-456', 'user-123', { content: 'test' })).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // getComments — additional
  // ═══════════════════════════════════════════════════════

  describe('getComments — additional', () => {
    it('should return empty array for post with zero comments', async () => {
      prisma.comment.findMany.mockResolvedValue([]);

      const result = await service.getComments('post-456');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should detect hasMore when more comments exist', async () => {
      const comments = Array(21).fill(null).map((_, i) => ({
        id: `comment-${i}`,
        content: `Comment ${i}`,
        user: { id: 'u1' },
        _count: { replies: 0 },
      }));
      prisma.comment.findMany.mockResolvedValue(comments);

      const result = await service.getComments('post-456', undefined, 20);
      expect(result.data).toHaveLength(20);
      expect(result.meta.hasMore).toBe(true);
    });
  });

});
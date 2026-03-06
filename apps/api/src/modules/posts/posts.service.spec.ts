import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { NotificationsService } from '../notifications/notifications.service';
import { PostsService } from './posts.service';

describe('PostsService', () => {
  let service: PostsService;
  let prisma: any;
  let redis: jest.Mocked<Redis>;
  let notifications: jest.Mocked<NotificationsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
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
      prisma.$transaction.mockResolvedValue([mockPost, undefined]);

      const result = await service.create(userId, dto);

      expect(prisma.post.create).toHaveBeenCalledWith({
        data: {
          userId,
          postType: dto.postType,
          content: dto.content,
          visibility: dto.visibility,
          circleId: undefined,
          mediaUrls: [],
          mediaTypes: [],
          thumbnailUrl: undefined,
          mediaWidth: undefined,
          mediaHeight: undefined,
          videoDuration: undefined,
          hashtags: [],
          mentions: [],
          locationName: undefined,
          isSensitive: false,
          altText: undefined,
          hideLikesCount: false,
          commentsDisabled: false,
        },
        select: expect.any(Object),
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { postsCount: { increment: 1 } },
      });
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
});
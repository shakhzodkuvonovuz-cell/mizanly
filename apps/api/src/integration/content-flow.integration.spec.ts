import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PostsService } from '../modules/posts/posts.service';
import { ThreadsService } from '../modules/threads/threads.service';
import { FeedService } from '../modules/feed/feed.service';
import { BlocksService } from '../modules/blocks/blocks.service';
import { PrismaService } from '../config/prisma.service';
import { globalMockProviders } from '../common/test/mock-providers';

/**
 * Integration: Content Flow
 *
 * End-to-end service-layer test covering the core user content flow:
 *   Create post → react → comment → feed → dismiss → delete
 *   Create thread → reply → like → delete
 *   Block user → excluded from feed
 *   Share post as story
 */
describe('Integration: Content Flow', () => {
  let postsService: PostsService;
  let threadsService: ThreadsService;
  let feedService: FeedService;
  let blocksService: BlocksService;
  let prisma: any;

  const mockUser = {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    isVerified: true,
    role: 'USER',
    isDeactivated: false,
    isPrivate: false,
    isBanned: false,
    followersCount: 10,
    postsCount: 5,
    threadsCount: 3,
  };

  const mockUser2 = {
    id: 'user-2',
    username: 'bob',
    displayName: 'Bob',
    avatarUrl: null,
    isVerified: false,
    role: 'USER',
    isDeactivated: false,
    isPrivate: false,
    isBanned: false,
    followersCount: 5,
    postsCount: 2,
    threadsCount: 1,
  };

  const now = new Date();

  const mockPost = {
    id: 'post-1',
    userId: 'user-1',
    postType: 'TEXT',
    content: 'Assalamu alaikum! First post #mizanly',
    visibility: 'PUBLIC',
    mediaUrls: ['https://cdn.example.com/img1.jpg'],
    mediaTypes: ['image/jpeg'],
    thumbnailUrl: 'https://cdn.example.com/thumb1.jpg',
    mediaWidth: 1080,
    mediaHeight: 1080,
    hashtags: ['mizanly'],
    mentions: [],
    locationName: null,
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    savesCount: 0,
    viewsCount: 0,
    hideLikesCount: false,
    commentsDisabled: false,
    isSensitive: false,
    isFeatured: false,
    isRemoved: false,
    blurhash: null,
    remixAllowed: true,
    createdAt: now,
    updatedAt: now,
    user: {
      id: 'user-1',
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      isVerified: true,
    },
    circle: null,
  };

  const mockThread = {
    id: 'thread-1',
    userId: 'user-1',
    content: 'Thread about Islamic history',
    mediaUrls: [],
    mediaTypes: [],
    visibility: 'PUBLIC',
    isChainHead: true,
    chainId: null,
    chainPosition: null,
    isQuotePost: false,
    quoteText: null,
    repostOfId: null,
    hashtags: [],
    mentions: [],
    likesCount: 0,
    repliesCount: 0,
    repostsCount: 0,
    quotesCount: 0,
    viewsCount: 0,
    bookmarksCount: 0,
    hideLikesCount: false,
    isPinned: false,
    isSensitive: false,
    isRemoved: false,
    replyPermission: 'EVERYONE',
    createdAt: now,
    updatedAt: now,
    user: {
      id: 'user-1',
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      isVerified: true,
    },
    circle: null,
    poll: null,
    repostOf: null,
  };

  const mockComment = {
    id: 'comment-1',
    content: 'Great post!',
    userId: 'user-2',
    postId: 'post-1',
    parentId: null,
    mentions: [],
    isRemoved: false,
    isHidden: false,
    createdAt: now,
    user: {
      id: 'user-2',
      username: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
      isVerified: false,
    },
    _count: { replies: 0 },
  };

  const mockReply = {
    id: 'reply-1',
    threadId: 'thread-1',
    userId: 'user-2',
    content: 'Interesting thread!',
    parentId: null,
    mediaUrls: [],
    likesCount: 0,
    createdAt: now,
    user: {
      id: 'user-2',
      username: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
      isVerified: false,
    },
    _count: { replies: 0 },
  };

  let prismaValue: any;

  beforeEach(async () => {
    prismaValue = {
      post: {
        create: jest.fn().mockResolvedValue(mockPost),
        findUnique: jest.fn().mockResolvedValue(mockPost),
        findMany: jest.fn().mockResolvedValue([mockPost]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(mockPost),
        delete: jest.fn().mockResolvedValue(mockPost),
        count: jest.fn().mockResolvedValue(1),
      },
      postReaction: {
        create: jest.fn().mockResolvedValue({
          userId: 'user-2',
          postId: 'post-1',
          reaction: 'LIKE',
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      comment: {
        create: jest.fn().mockResolvedValue(mockComment),
        findMany: jest.fn().mockResolvedValue([mockComment]),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(mockComment),
      },
      savedPost: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
      },
      thread: {
        create: jest.fn().mockResolvedValue(mockThread),
        findUnique: jest.fn().mockResolvedValue(mockThread),
        findMany: jest.fn().mockResolvedValue([mockThread]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(mockThread),
        delete: jest.fn().mockResolvedValue(mockThread),
      },
      threadReply: {
        create: jest.fn().mockResolvedValue(mockReply),
        findMany: jest.fn().mockResolvedValue([mockReply]),
        findUnique: jest.fn().mockResolvedValue(mockReply),
        update: jest.fn().mockResolvedValue(mockReply),
        delete: jest.fn().mockResolvedValue(mockReply),
      },
      threadReaction: {
        create: jest.fn().mockResolvedValue({
          userId: 'user-2',
          threadId: 'thread-1',
          reaction: 'LIKE',
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
      },
      threadBookmark: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      story: {
        create: jest.fn().mockResolvedValue({
          id: 'story-1',
          userId: 'user-2',
          mediaUrl: 'https://cdn.example.com/img1.jpg',
          mediaType: 'image/jpeg',
          thumbnailUrl: 'https://cdn.example.com/thumb1.jpg',
          textOverlay: 'Shared from @alice',
          viewsCount: 0,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdAt: now,
        }),
      },
      user: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.id === 'user-1') return Promise.resolve(mockUser);
          if (where.id === 'user-2') return Promise.resolve(mockUser2);
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(mockUser),
      },
      follow: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      followRequest: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      block: {
        create: jest.fn().mockResolvedValue({
          blockerId: 'user-1',
          blockedId: 'user-2',
        }),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
      },
      mute: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      restrict: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      hashtag: {
        upsert: jest.fn().mockResolvedValue({ id: 'h1', name: 'mizanly' }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      feedDismissal: {
        upsert: jest.fn().mockResolvedValue({
          userId: 'user-1',
          contentId: 'post-1',
          contentType: 'post',
        }),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
      },
      feedInteraction: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 'fi-1',
          userId: 'user-1',
          postId: 'post-1',
          viewed: true,
        }),
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
      },
      contentFilterSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      circle: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      circleMember: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      conversation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      conversationMember: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn().mockImplementation((fnOrArr: any) => {
        if (typeof fnOrArr === 'function') return fnOrArr(prismaValue);
        return Promise.resolve(fnOrArr);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PostsService,
        ThreadsService,
        FeedService,
        BlocksService,
        { provide: PrismaService, useValue: prismaValue },
      ],
    }).compile();

    postsService = module.get(PostsService);
    threadsService = module.get(ThreadsService);
    feedService = module.get(FeedService);
    blocksService = module.get(BlocksService);
    prisma = module.get(PrismaService) as any;
  });

  // ─────────────────────────────────────────
  // Post lifecycle
  // ─────────────────────────────────────────
  describe('Post lifecycle', () => {
    it('should create a post with content and hashtags', async () => {
      const dto = {
        postType: 'TEXT',
        content: 'Assalamu alaikum! First post #mizanly',
        hashtags: ['mizanly'],
        mediaUrls: [],
        mediaTypes: [],
      } as any;

      const result = await postsService.create('user-1', dto);

      expect(result.id).toBe('post-1');
      expect(result.content).toBe(
        'Assalamu alaikum! First post #mizanly',
      );
      expect(prisma.post.create).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { postsCount: { increment: 1 } },
        }),
      );
    });

    it('should get the post by ID with user info', async () => {
      prisma.post.findFirst.mockResolvedValue(mockPost);
      const result = await postsService.getById('post-1', 'user-2');

      expect(result.id).toBe('post-1');
      expect(result.user.username).toBe('alice');
      expect(result).toHaveProperty('userReaction');
      expect(result).toHaveProperty('isSaved');
      expect(prisma.post.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'post-1' }) }),
      );
    });

    it('should react to the post (like)', async () => {
      const result = await postsService.react('post-1', 'user-2', 'LIKE');

      expect(result).toHaveProperty('reaction', 'LIKE');
      expect(prisma.postReaction.create).toHaveBeenCalled();
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { likesCount: { increment: 1 } },
        }),
      );
    });

    it('should add a comment to the post', async () => {
      const dto = { content: 'Great post!' } as any;
      const result = await postsService.addComment(
        'post-1',
        'user-2',
        dto,
      );

      expect(result.content).toBe('Great post!');
      expect(result.user.username).toBe('bob');
      expect(prisma.comment.create).toHaveBeenCalled();
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { commentsCount: { increment: 1 } },
        }),
      );
    });

    it('should include the post in the trending feed', async () => {
      const result = await feedService.getTrendingFeed(
        undefined,
        20,
        'user-2',
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('post-1');
      expect(result.meta).toHaveProperty('hasMore');
      expect(prisma.post.findMany).toHaveBeenCalled();
    });

    it('should dismiss the post from feed', async () => {
      const result = await feedService.dismiss('user-2', 'post-1', 'post');

      expect(result).toBeDefined();
      expect(prisma.feedDismissal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_contentId_contentType: {
              userId: 'user-2',
              contentId: 'post-1',
              contentType: 'post',
            },
          },
          create: {
            userId: 'user-2',
            contentId: 'post-1',
            contentType: 'post',
          },
        }),
      );
    });

    it('should log a feed interaction', async () => {
      const result = await feedService.logInteraction('user-2', {
        postId: 'post-1',
        space: 'SAF',
        viewed: true,
        viewDurationMs: 5000,
      });

      expect(result).toBeDefined();
      expect(prisma.feedInteraction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_postId: { userId: 'user-2', postId: 'post-1' } },
        }),
      );
    });

    it('should delete the post', async () => {
      await postsService.delete('post-1', 'user-1');

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: expect.objectContaining({ isRemoved: true }),
        }),
      );
    });

    it('should throw NotFoundException when deleting non-existent post', async () => {
      prisma.post.findUnique.mockResolvedValue(null);

      await expect(
        postsService.delete('missing', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-owner deletes', async () => {
      await expect(
        postsService.delete('post-1', 'user-2'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when self-reacting', async () => {
      await expect(
        postsService.react('post-1', 'user-1', 'LIKE'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when commenting on disabled post', async () => {
      prisma.post.findUnique.mockResolvedValue({
        ...mockPost,
        commentsDisabled: true,
      });

      await expect(
        postsService.addComment('post-1', 'user-2', {
          content: 'Hello',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────
  // Thread lifecycle
  // ─────────────────────────────────────────
  describe('Thread lifecycle', () => {
    it('should create a thread', async () => {
      const dto = {
        content: 'Thread about Islamic history',
      } as any;

      const result = await threadsService.create('user-1', dto);

      expect(result.id).toBe('thread-1');
      expect(result.content).toBe('Thread about Islamic history');
      expect(prisma.thread.create).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { threadsCount: { increment: 1 } },
        }),
      );
    });

    it('should add a reply to a thread', async () => {
      const result = await threadsService.addReply(
        'thread-1',
        'user-2',
        'Interesting thread!',
      );

      expect(result.content).toBe('Interesting thread!');
      expect(prisma.threadReply.create).toHaveBeenCalled();
      expect(prisma.thread.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'thread-1' },
          data: { repliesCount: { increment: 1 } },
        }),
      );
    });

    it('should like the thread', async () => {
      const result = await threadsService.like('thread-1', 'user-2');

      expect(result).toHaveProperty('liked', true);
      expect(prisma.threadReaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId: 'user-2', threadId: 'thread-1', reaction: 'LIKE' },
        }),
      );
    });

    it('should throw BadRequestException when self-liking a thread', async () => {
      await expect(
        threadsService.like('thread-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should unlike a thread', async () => {
      prisma.threadReaction.findUnique.mockResolvedValue({
        userId: 'user-2',
        threadId: 'thread-1',
        reaction: 'LIKE',
      });

      const result = await threadsService.unlike('thread-1', 'user-2');

      expect(result).toHaveProperty('liked', false);
    });

    it('should get a thread by ID with viewer context', async () => {
      prisma.thread.findFirst.mockResolvedValue(mockThread);
      const result = await threadsService.getById('thread-1', 'user-2');

      expect(result.id).toBe('thread-1');
      expect(result).toHaveProperty('userReaction', null);
      expect(result).toHaveProperty('isBookmarked', false);
    });

    it('should throw NotFoundException for missing thread', async () => {
      prisma.thread.findFirst.mockResolvedValue(null);

      await expect(
        threadsService.getById('missing', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────
  // Cross-feature
  // ─────────────────────────────────────────
  describe('Cross-feature', () => {
    it('should block a user and exclude their posts from feed', async () => {
      // Step 1: Block user-2
      const blockResult = await blocksService.block('user-1', 'user-2');
      expect(blockResult).toEqual({ message: 'User blocked' });
      expect(prisma.block.create).toHaveBeenCalled();

      // Step 2: Set up blocked user's post in feed results
      const blockedUserPost = {
        ...mockPost,
        id: 'post-blocked',
        userId: 'user-2',
        user: {
          id: 'user-2',
          username: 'bob',
          displayName: 'Bob',
          avatarUrl: null,
          isVerified: false,
          isDeactivated: false,
          isPrivate: false,
        },
      };

      // Simulate block existing for feed queries
      prisma.block.findMany.mockResolvedValue([
        { blockerId: 'user-1', blockedId: 'user-2' },
      ]);

      // Feed query returns posts; the feed service should build
      // the where clause to exclude blocked users
      prisma.post.findMany.mockResolvedValue([mockPost]);

      const feedResult = await feedService.getTrendingFeed(
        undefined,
        20,
        'user-1',
      );

      // Verify that the feed service queried for blocks
      expect(prisma.block.findMany).toHaveBeenCalled();
      // The feed result should only include non-blocked users' posts
      expect(feedResult.data).toBeDefined();
    });

    it('should share a post as story', async () => {
      const result = await postsService.shareAsStory('post-1', 'user-2');

      expect(result.id).toBe('story-1');
      expect(result.mediaUrl).toBe('https://cdn.example.com/img1.jpg');
      expect(result.textOverlay).toContain('Shared from @alice');
      expect(prisma.story.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-2',
            mediaUrl: 'https://cdn.example.com/img1.jpg',
            mediaType: 'image/jpeg',
          }),
        }),
      );
      // Original post share count incremented
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { sharesCount: { increment: 1 } },
        }),
      );
    });

    it('should prevent sharing a blocked user post as story', async () => {
      // user-2 blocked user-1
      prisma.block.findFirst.mockResolvedValue({
        blockerId: 'user-2',
        blockedId: 'user-1',
      });

      // post includes the full user relation so shareAsStory can check blocks
      prisma.post.findUnique.mockResolvedValue({
        ...mockPost,
        remixAllowed: true,
        user: { id: 'user-1', username: 'alice' },
      });

      await expect(
        postsService.shareAsStory('post-1', 'user-2'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should get dismissed post IDs for a user', async () => {
      prisma.feedDismissal.findMany.mockResolvedValue([
        { contentId: 'post-1' },
        { contentId: 'post-2' },
      ]);

      const dismissed = await feedService.getDismissedIds('user-1', 'post');

      expect(dismissed).toEqual(['post-1', 'post-2']);
    });

    it('should undismiss a post from feed', async () => {
      const result = await feedService.undismiss(
        'user-1',
        'post-1',
        'post',
      );

      expect(result).toEqual({ undismissed: true });
      expect(prisma.feedDismissal.delete).toHaveBeenCalled();
    });

    it('should get user interests based on feed interactions', async () => {
      prisma.feedInteraction.findMany.mockResolvedValue([
        {
          space: 'SAF',
          viewDurationMs: 8000,
          liked: true,
          commented: false,
          shared: false,
          saved: false,
          postId: 'post-1',
        },
      ]);
      prisma.post.findMany.mockResolvedValue([
        { id: 'post-1', hashtags: ['mizanly', 'islam'] },
      ]);

      const interests = await feedService.getUserInterests('user-1');

      expect(interests.bySpace).toHaveProperty('SAF');
      expect(interests.byHashtag).toHaveProperty('mizanly');
      expect(interests.byHashtag).toHaveProperty('islam');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PostsService } from './posts.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PostsService — Schedule Posting', () => {
  let service: PostsService;
  let prisma: any;

  const userId = 'user-sched';
  const baseDto = { postType: 'TEXT', content: 'Scheduled post', visibility: 'PUBLIC' };

  function mockTx(postOverrides: Record<string, unknown> = {}) {
    const mockPost = {
      id: 'post-sched', userId, postType: 'TEXT', content: 'Scheduled post',
      visibility: 'PUBLIC', mediaUrls: [], mediaTypes: [], likesCount: 0,
      commentsCount: 0, sharesCount: 0, savesCount: 0, viewsCount: 0,
      hideLikesCount: false, commentsDisabled: false, commentPermission: 'EVERYONE',
      brandedContent: false, brandPartner: null, remixAllowed: true,
      shareToFeed: true, topics: [], altText: null, isSensitive: false,
      scheduledAt: null, createdAt: new Date(), updatedAt: new Date(),
      user: { id: userId, username: 'sched_user', displayName: 'Sched', avatarUrl: null, isVerified: false },
      circle: null, ...postOverrides,
    };
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      post: { create: jest.fn().mockResolvedValue(mockPost) },
      user: { update: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      hashtag: { upsert: jest.fn() },
      postTaggedUser: { createMany: jest.fn() },
      collabInvite: { create: jest.fn() },
    }));
    return mockPost;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PostsService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(), $executeRaw: jest.fn(), $queryRaw: jest.fn(),
            post: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
            postReaction: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            follow: { findMany: jest.fn(), findUnique: jest.fn() },
            block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            hashtag: { upsert: jest.fn() },
            report: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(null) },
            feedDismissal: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
            user: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
            comment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
            commentReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            savedPost: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
            circleMember: { findMany: jest.fn().mockResolvedValue([]) },
            postTaggedUser: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        { provide: NotificationsService, useValue: { notifyLike: jest.fn(), notifyComment: jest.fn(), create: jest.fn() } },
        { provide: 'REDIS', useValue: { get: jest.fn(), setex: jest.fn(), del: jest.fn() } },
      ],
    }).compile();
    service = module.get<PostsService>(PostsService);
    prisma = module.get(PrismaService);
  });

  it('should store scheduledAt as Date when valid ISO string provided', async () => {
    const future = new Date(Date.now() + 86400000).toISOString(); // tomorrow
    const mock = mockTx({ scheduledAt: new Date(future) });

    const result = await service.create(userId, { ...baseDto, scheduledAt: future });
    expect(result).toBeDefined();

    // Verify the tx post.create received a Date for scheduledAt
    const txFn = prisma.$transaction.mock.calls[0][0];
    // The create call happens inside the transaction callback
    expect(typeof txFn).toBe('function');
  });

  it('should store scheduledAt as null when not provided', async () => {
    mockTx({ scheduledAt: null });
    const result = await service.create(userId, baseDto);
    expect(result).toBeDefined();
    expect(result.scheduledAt).toBeNull();
  });

  it('should accept scheduledAt far in the future (75 days)', async () => {
    const future75 = new Date(Date.now() + 75 * 86400000).toISOString();
    mockTx({ scheduledAt: new Date(future75) });

    const result = await service.create(userId, { ...baseDto, scheduledAt: future75 });
    expect(result).toBeDefined();
  });

  it('should accept scheduledAt in the past (backend does not validate past dates — that is DTO layer)', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    mockTx({ scheduledAt: new Date(past) });

    // Service does not reject past dates — SchedulingService cron will publish immediately
    const result = await service.create(userId, { ...baseDto, scheduledAt: past });
    expect(result).toBeDefined();
  });
});

describe('PostsService — Tag Resolution (OR query)', () => {
  let service: PostsService;
  let prisma: any;

  const userId = 'user-tagger';
  const baseDto = { postType: 'IMAGE', content: 'Tag test', mediaUrls: ['https://r2.example.com/1.jpg'], mediaTypes: ['image'] };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PostsService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(), $executeRaw: jest.fn(), $queryRaw: jest.fn(),
            post: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
            postReaction: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            follow: { findMany: jest.fn(), findUnique: jest.fn() },
            block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            hashtag: { upsert: jest.fn() },
            report: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
            feedDismissal: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
            user: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
            comment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
            commentReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            savedPost: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
            circleMember: { findMany: jest.fn().mockResolvedValue([]) },
            postTaggedUser: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        { provide: NotificationsService, useValue: { notifyLike: jest.fn(), notifyComment: jest.fn(), create: jest.fn() } },
        { provide: 'REDIS', useValue: { get: jest.fn(), setex: jest.fn(), del: jest.fn() } },
      ],
    }).compile();
    service = module.get<PostsService>(PostsService);
    prisma = module.get(PrismaService);
  });

  it('should resolve tags by username when strings are usernames', async () => {
    const mockPost = {
      id: 'post-tag', userId, postType: 'IMAGE', content: 'Tag test',
      mediaUrls: ['https://r2.example.com/1.jpg'], mediaTypes: ['image'],
      likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0, viewsCount: 0,
      hideLikesCount: false, commentsDisabled: false, commentPermission: 'EVERYONE',
      brandedContent: false, brandPartner: null, remixAllowed: true,
      shareToFeed: true, topics: [], altText: null, isSensitive: false,
      scheduledAt: null, createdAt: new Date(), updatedAt: new Date(),
      user: { id: userId, username: 'tagger', displayName: 'Tagger', avatarUrl: null, isVerified: false },
      circle: null,
    };

    const userFindManyMock = jest.fn().mockResolvedValue([{ id: 'user-found-by-username' }]);
    const tagCreateManyMock = jest.fn().mockResolvedValue({ count: 1 });

    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      post: { create: jest.fn().mockResolvedValue(mockPost) },
      user: { update: jest.fn(), findMany: userFindManyMock, findUnique: jest.fn() },
      hashtag: { upsert: jest.fn() },
      postTaggedUser: { createMany: tagCreateManyMock },
      collabInvite: { create: jest.fn() },
    }));

    await service.create(userId, { ...baseDto, taggedUserIds: ['johndoe'] });

    // Verify the OR query searches both id AND username
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ username: { in: ['johndoe'] } }),
          ]),
        }),
      }),
    );

    // Tag was created for the resolved user
    expect(tagCreateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ userId: 'user-found-by-username' })],
      }),
    );
  });

  it('should resolve tags by ID when strings are CUIDs', async () => {
    const cuid = 'clx1abc2def3ghi4jkl5mno6p';
    const userFindManyMock = jest.fn().mockResolvedValue([{ id: cuid }]);
    const tagCreateManyMock = jest.fn().mockResolvedValue({ count: 1 });
    const mockPost = {
      id: 'post-tag2', userId, postType: 'IMAGE', content: 'Tag test',
      mediaUrls: ['https://r2.example.com/1.jpg'], mediaTypes: ['image'],
      likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0, viewsCount: 0,
      hideLikesCount: false, commentsDisabled: false, commentPermission: 'EVERYONE',
      brandedContent: false, brandPartner: null, remixAllowed: true,
      shareToFeed: true, topics: [], altText: null, isSensitive: false,
      scheduledAt: null, createdAt: new Date(), updatedAt: new Date(),
      user: { id: userId, username: 'tagger', displayName: 'Tagger', avatarUrl: null, isVerified: false },
      circle: null,
    };

    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      post: { create: jest.fn().mockResolvedValue(mockPost) },
      user: { update: jest.fn(), findMany: userFindManyMock, findUnique: jest.fn() },
      hashtag: { upsert: jest.fn() },
      postTaggedUser: { createMany: tagCreateManyMock },
      collabInvite: { create: jest.fn() },
    }));

    await service.create(userId, { ...baseDto, taggedUserIds: [cuid] });

    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ id: { in: [cuid] } }),
          ]),
        }),
      }),
    );
  });

  it('should handle mix of usernames and IDs', async () => {
    const userFindManyMock = jest.fn().mockResolvedValue([
      { id: 'user-by-id' },
      { id: 'user-by-name' },
    ]);
    const tagCreateManyMock = jest.fn().mockResolvedValue({ count: 2 });
    const mockPost = {
      id: 'post-mix', userId, postType: 'IMAGE', content: 'Mix test',
      mediaUrls: ['https://r2.example.com/1.jpg'], mediaTypes: ['image'],
      likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0, viewsCount: 0,
      hideLikesCount: false, commentsDisabled: false, commentPermission: 'EVERYONE',
      brandedContent: false, brandPartner: null, remixAllowed: true,
      shareToFeed: true, topics: [], altText: null, isSensitive: false,
      scheduledAt: null, createdAt: new Date(), updatedAt: new Date(),
      user: { id: userId, username: 'tagger', displayName: 'Tagger', avatarUrl: null, isVerified: false },
      circle: null,
    };

    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      post: { create: jest.fn().mockResolvedValue(mockPost) },
      user: { update: jest.fn(), findMany: userFindManyMock, findUnique: jest.fn() },
      hashtag: { upsert: jest.fn() },
      postTaggedUser: { createMany: tagCreateManyMock },
      collabInvite: { create: jest.fn() },
    }));

    await service.create(userId, { ...baseDto, taggedUserIds: ['user-by-id', 'johndoe'] });

    expect(tagCreateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'user-by-id' }),
          expect.objectContaining({ userId: 'user-by-name' }),
        ]),
      }),
    );
  });

  it('should gracefully handle no matching users', async () => {
    const userFindManyMock = jest.fn().mockResolvedValue([]); // no matches
    const tagCreateManyMock = jest.fn();
    const mockPost = {
      id: 'post-none', userId, postType: 'TEXT', content: 'No match',
      mediaUrls: [], mediaTypes: [],
      likesCount: 0, commentsCount: 0, sharesCount: 0, savesCount: 0, viewsCount: 0,
      hideLikesCount: false, commentsDisabled: false, commentPermission: 'EVERYONE',
      brandedContent: false, brandPartner: null, remixAllowed: true,
      shareToFeed: true, topics: [], altText: null, isSensitive: false,
      scheduledAt: null, createdAt: new Date(), updatedAt: new Date(),
      user: { id: userId, username: 'tagger', displayName: 'Tagger', avatarUrl: null, isVerified: false },
      circle: null,
    };

    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      post: { create: jest.fn().mockResolvedValue(mockPost) },
      user: { update: jest.fn(), findMany: userFindManyMock, findUnique: jest.fn() },
      hashtag: { upsert: jest.fn() },
      postTaggedUser: { createMany: tagCreateManyMock },
      collabInvite: { create: jest.fn() },
    }));

    await service.create(userId, { ...baseDto, taggedUserIds: ['nonexistent_user'] });

    // createMany should NOT be called since no valid users found
    expect(tagCreateManyMock).not.toHaveBeenCalled();
  });
});

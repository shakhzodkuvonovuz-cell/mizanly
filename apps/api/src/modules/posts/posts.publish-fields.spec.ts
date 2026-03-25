import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PostsService } from './posts.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * Tests for Session 5: Publish fields wired to backend.
 * Covers: commentPermission, taggedUserIds, collaboratorUsername,
 * brandedContent, brandPartner, remixAllowed, shareToFeed, topics,
 * locationLat, locationLng.
 */
describe('PostsService — Publish Fields', () => {
  let service: PostsService;
  let prisma: any;
  let notifications: any;

  const userId = 'user-creator';

  const baseDto = {
    postType: 'IMAGE',
    content: 'Test post',
    visibility: 'PUBLIC',
    mediaUrls: ['https://r2.example.com/image.jpg'],
    mediaTypes: ['image'],
  };

  const baseMockPost = {
    id: 'post-new',
    userId,
    postType: 'IMAGE',
    content: 'Test post',
    visibility: 'PUBLIC',
    mediaUrls: ['https://r2.example.com/image.jpg'],
    mediaTypes: ['image'],
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    savesCount: 0,
    viewsCount: 0,
    hideLikesCount: false,
    commentsDisabled: false,
    commentPermission: 'EVERYONE',
    brandedContent: false,
    brandPartner: null,
    remixAllowed: true,
    shareToFeed: true,
    topics: [],
    altText: null,
    isSensitive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: userId, username: 'creator', displayName: 'Creator', avatarUrl: null, isVerified: false },
    circle: null,
  };

  // Helper to create a mock transaction that captures the data passed to post.create
  function createMockTx(overrides: Record<string, unknown> = {}) {
    const postCreateMock = jest.fn().mockImplementation(async (args: any) => ({
      ...baseMockPost,
      ...args.data,
      ...overrides,
    }));
    const userUpdateMock = jest.fn().mockResolvedValue(undefined);
    const hashtagUpsertMock = jest.fn().mockResolvedValue({});
    const userFindManyMock = jest.fn().mockResolvedValue([]);
    const userFindUniqueMock = jest.fn().mockResolvedValue(null);
    const postTaggedUserCreateManyMock = jest.fn().mockResolvedValue({ count: 0 });
    const collabInviteCreateMock = jest.fn().mockResolvedValue({});

    return {
      postCreateMock,
      userUpdateMock,
      userFindManyMock,
      userFindUniqueMock,
      postTaggedUserCreateManyMock,
      collabInviteCreateMock,
      tx: {
        post: { create: postCreateMock },
        user: { update: userUpdateMock, findMany: userFindManyMock, findUnique: userFindUniqueMock },
        hashtag: { upsert: hashtagUpsertMock },
        postTaggedUser: { createMany: postTaggedUserCreateManyMock },
        collabInvite: { create: collabInviteCreateMock },
      },
    };
  }

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
            post: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
            like: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            postReaction: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            follow: { findMany: jest.fn() },
            block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
            mute: { findMany: jest.fn().mockResolvedValue([]) },
            hashtag: { upsert: jest.fn() },
            report: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(null) },
            feedDismissal: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
            user: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
            postTaggedUser: { findMany: jest.fn().mockResolvedValue([]) },
            comment: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
            commentReaction: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
            savedPost: { create: jest.fn(), delete: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
            circleMember: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        {
          provide: NotificationsService,
          useValue: { notifyLike: jest.fn(), notifyComment: jest.fn(), create: jest.fn().mockResolvedValue({ id: 'notif-1' }) },
        },
        {
          provide: 'REDIS',
          useValue: { get: jest.fn(), setex: jest.fn(), del: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    prisma = module.get(PrismaService) as any;
    notifications = module.get(NotificationsService);
  });

  // ── commentPermission ──

  describe('commentPermission', () => {
    it('should default to EVERYONE when not provided', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, baseDto);

      const createCall = postCreateMock.mock.calls[0][0];
      expect(createCall.data.commentPermission).toBe('EVERYONE');
      expect(createCall.data.commentsDisabled).toBe(false);
    });

    it('should set FOLLOWERS when provided', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, { ...baseDto, commentPermission: 'FOLLOWERS' });

      const createCall = postCreateMock.mock.calls[0][0];
      expect(createCall.data.commentPermission).toBe('FOLLOWERS');
      expect(createCall.data.commentsDisabled).toBe(false);
    });

    it('should set NOBODY and commentsDisabled=true', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, { ...baseDto, commentPermission: 'NOBODY' });

      const createCall = postCreateMock.mock.calls[0][0];
      expect(createCall.data.commentPermission).toBe('NOBODY');
      expect(createCall.data.commentsDisabled).toBe(true);
    });

    it('should respect legacy commentsDisabled when commentPermission not set', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, { ...baseDto, commentsDisabled: true });

      const createCall = postCreateMock.mock.calls[0][0];
      expect(createCall.data.commentsDisabled).toBe(true);
    });
  });

  // ── taggedUserIds ──

  describe('taggedUserIds', () => {
    it('should create PostTaggedUser records for valid user IDs', async () => {
      const taggedIds = ['user-a', 'user-b'];
      const { postCreateMock, tx, postTaggedUserCreateManyMock, userFindManyMock } = createMockTx();
      userFindManyMock.mockResolvedValue([{ id: 'user-a' }, { id: 'user-b' }]);
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, { ...baseDto, taggedUserIds: taggedIds });

      expect(userFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ id: { in: taggedIds } }),
              expect.objectContaining({ username: { in: taggedIds } }),
            ]),
          }),
        }),
      );
      expect(postTaggedUserCreateManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ userId: 'user-a' }),
            expect.objectContaining({ userId: 'user-b' }),
          ]),
          skipDuplicates: true,
        }),
      );
    });

    it('should filter out banned and deleted users from tags', async () => {
      const { tx, userFindManyMock, postTaggedUserCreateManyMock } = createMockTx();
      // Only user-a passes the isDeleted: false, isBanned: false filter
      userFindManyMock.mockResolvedValue([{ id: 'user-a' }]);
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
      prisma.postTaggedUser.findMany.mockResolvedValue([{ userId: 'user-a' }]);

      await service.create(userId, { ...baseDto, taggedUserIds: ['user-a', 'user-banned'] });

      const createManyCall = postTaggedUserCreateManyMock.mock.calls[0][0];
      expect(createManyCall.data).toHaveLength(1);
      expect(createManyCall.data[0].userId).toBe('user-a');
    });

    it('should not create tags when taggedUserIds is empty', async () => {
      const { tx, postTaggedUserCreateManyMock } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, { ...baseDto, taggedUserIds: [] });

      expect(postTaggedUserCreateManyMock).not.toHaveBeenCalled();
    });

    it('should send tag notifications to tagged users (not self)', async () => {
      const { tx, userFindManyMock } = createMockTx();
      userFindManyMock.mockResolvedValue([{ id: 'user-a' }]);
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
      // Mock the postTaggedUser.findMany (used for notification loop)
      prisma.postTaggedUser.findMany.mockResolvedValue([{ userId: 'user-a' }]);
      prisma.user.findUnique.mockResolvedValue({ username: 'creator' });

      await service.create(userId, { ...baseDto, taggedUserIds: ['user-a'] });

      // Wait for async notification fire
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-a',
          actorId: userId,
          type: 'TAG',
          title: 'Tagged you',
        }),
      );
    });

    it('should not send tag notification to self', async () => {
      const { tx, userFindManyMock } = createMockTx();
      userFindManyMock.mockResolvedValue([{ id: userId }]);
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
      // The only tagged user is self — postTaggedUser still created but notif skipped
      prisma.postTaggedUser.findMany.mockResolvedValue([{ userId }]);

      await service.create(userId, { ...baseDto, taggedUserIds: [userId] });

      await new Promise(resolve => setTimeout(resolve, 50));
      const tagCalls = (notifications.create as jest.Mock).mock.calls.filter(
        (c: any[]) => c[0]?.title === 'Tagged you',
      );
      expect(tagCalls).toHaveLength(0);
    });
  });

  // ── collaboratorUsername ──

  describe('collaboratorUsername', () => {
    it('should create CollabInvite when valid username provided', async () => {
      const { tx, collabInviteCreateMock } = createMockTx();
      tx.user.findUnique = jest.fn().mockResolvedValue({ id: 'user-collab' });
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
      prisma.user.findUnique.mockResolvedValue({ username: 'creator' });

      await service.create(userId, { ...baseDto, collaboratorUsername: 'collaborator' });

      expect(collabInviteCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            inviterId: userId,
            inviteeId: 'user-collab',
          }),
        }),
      );
    });

    it('should not create invite for self', async () => {
      const { tx, collabInviteCreateMock } = createMockTx();
      tx.user.findUnique = jest.fn().mockResolvedValue({ id: userId });
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, { ...baseDto, collaboratorUsername: 'creator' });

      expect(collabInviteCreateMock).not.toHaveBeenCalled();
    });

    it('should not crash when username does not exist', async () => {
      const { tx, collabInviteCreateMock } = createMockTx();
      tx.user.findUnique = jest.fn().mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await expect(
        service.create(userId, { ...baseDto, collaboratorUsername: 'nonexistent' }),
      ).resolves.toBeDefined();

      expect(collabInviteCreateMock).not.toHaveBeenCalled();
    });

    it('should send collab invite notification', async () => {
      const { tx } = createMockTx();
      tx.user.findUnique = jest.fn().mockResolvedValue({ id: 'user-collab' });
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
      prisma.user.findUnique.mockImplementation(async (args: any) => {
        if (args.where.username) return { id: 'user-collab' };
        return { username: 'creator' };
      });

      await service.create(userId, { ...baseDto, collaboratorUsername: 'collaborator' });

      await new Promise(resolve => setTimeout(resolve, 50));
      const collabCalls = (notifications.create as jest.Mock).mock.calls.filter(
        (c: any[]) => c[0]?.title === 'Collaboration invite',
      );
      expect(collabCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── brandedContent + brandPartner ──

  describe('brandedContent', () => {
    it('should default brandedContent to false', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, baseDto);

      const data = postCreateMock.mock.calls[0][0].data;
      expect(data.brandedContent).toBe(false);
      expect(data.brandPartner).toBeNull();
    });

    it('should set brandedContent with partner name', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, {
        ...baseDto,
        brandedContent: true,
        brandPartner: 'Nike',
      });

      const data = postCreateMock.mock.calls[0][0].data;
      expect(data.brandedContent).toBe(true);
      expect(data.brandPartner).toBe('Nike');
    });

    it('should clear brandPartner when brandedContent is false', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, {
        ...baseDto,
        brandedContent: false,
        brandPartner: 'Nike',
      });

      const data = postCreateMock.mock.calls[0][0].data;
      expect(data.brandedContent).toBe(false);
      expect(data.brandPartner).toBeNull();
    });
  });

  // ── remixAllowed ──

  describe('remixAllowed', () => {
    it('should default to true', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, baseDto);

      expect(postCreateMock.mock.calls[0][0].data.remixAllowed).toBe(true);
    });

    it('should be settable to false', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, { ...baseDto, remixAllowed: false });

      expect(postCreateMock.mock.calls[0][0].data.remixAllowed).toBe(false);
    });
  });

  // ── shareToFeed ──

  describe('shareToFeed', () => {
    it('should default to true', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, baseDto);

      expect(postCreateMock.mock.calls[0][0].data.shareToFeed).toBe(true);
    });

    it('should be settable to false', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, { ...baseDto, shareToFeed: false });

      expect(postCreateMock.mock.calls[0][0].data.shareToFeed).toBe(false);
    });
  });

  // ── topics ──

  describe('topics', () => {
    it('should default to empty array', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, baseDto);

      expect(postCreateMock.mock.calls[0][0].data.topics).toEqual([]);
    });

    it('should accept topic array (max 3)', async () => {
      const topics = ['islamic', 'technology', 'education'];
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, { ...baseDto, topics });

      expect(postCreateMock.mock.calls[0][0].data.topics).toEqual(topics);
    });
  });

  // ── location coordinates ──

  describe('locationLat / locationLng', () => {
    it('should pass coordinates through to Prisma', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, {
        ...baseDto,
        locationName: 'Sydney Opera House',
        locationLat: -33.8568,
        locationLng: 151.2153,
      });

      const data = postCreateMock.mock.calls[0][0].data;
      expect(data.locationName).toBe('Sydney Opera House');
      expect(data.locationLat).toBe(-33.8568);
      expect(data.locationLng).toBe(151.2153);
    });

    it('should accept null coordinates', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, { ...baseDto, locationName: 'Surry Hills' });

      const data = postCreateMock.mock.calls[0][0].data;
      expect(data.locationName).toBe('Surry Hills');
      expect(data.locationLat).toBeUndefined();
      expect(data.locationLng).toBeUndefined();
    });
  });

  // ── altText validation ──

  describe('altText', () => {
    it('should pass altText through to Prisma', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, { ...baseDto, altText: 'A sunset over the ocean' });

      expect(postCreateMock.mock.calls[0][0].data.altText).toBe('A sunset over the ocean');
    });

    it('should accept undefined altText', async () => {
      const { postCreateMock, tx } = createMockTx();
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.create(userId, baseDto);

      expect(postCreateMock.mock.calls[0][0].data.altText).toBeUndefined();
    });
  });

  // ── Full integration: all fields together ──

  describe('all publish fields combined', () => {
    it('should handle all fields simultaneously', async () => {
      const { postCreateMock, tx, userFindManyMock, postTaggedUserCreateManyMock, collabInviteCreateMock } = createMockTx();
      userFindManyMock.mockResolvedValue([{ id: 'user-tagged' }]);
      tx.user.findUnique = jest.fn().mockResolvedValue({ id: 'user-collab' });
      prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
      prisma.postTaggedUser.findMany.mockResolvedValue([{ userId: 'user-tagged' }]);
      prisma.user.findUnique.mockResolvedValue({ username: 'creator' });

      const fullDto = {
        ...baseDto,
        altText: 'Beautiful mosque at sunset',
        locationName: 'Surry Hills, Sydney',
        locationLat: -33.8862,
        locationLng: 151.2113,
        taggedUserIds: ['user-tagged'],
        collaboratorUsername: 'collab_user',
        commentPermission: 'FOLLOWERS',
        shareToFeed: true,
        brandedContent: true,
        brandPartner: 'Islamic Relief',
        remixAllowed: false,
        topics: ['islamic', 'community'],
      };

      await service.create(userId, fullDto);

      const data = postCreateMock.mock.calls[0][0].data;
      expect(data.altText).toBe('Beautiful mosque at sunset');
      expect(data.locationName).toBe('Surry Hills, Sydney');
      expect(data.locationLat).toBe(-33.8862);
      expect(data.locationLng).toBe(151.2113);
      expect(data.commentPermission).toBe('FOLLOWERS');
      expect(data.brandedContent).toBe(true);
      expect(data.brandPartner).toBe('Islamic Relief');
      expect(data.remixAllowed).toBe(false);
      expect(data.shareToFeed).toBe(true);
      expect(data.topics).toEqual(['islamic', 'community']);

      // Tagged users
      expect(postTaggedUserCreateManyMock).toHaveBeenCalled();

      // Collab invite
      expect(collabInviteCreateMock).toHaveBeenCalled();
    });
  });
});

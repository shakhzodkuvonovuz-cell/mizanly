import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationsService } from './recommendations.service';
import { PrismaService } from '../../config/prisma.service';
import { PostVisibility, ReelStatus } from '@prisma/client';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        RecommendationsService,
        {
          provide: PrismaService,
          useValue: {
            block: {
              findMany: jest.fn(),
            },
            mute: {
              findMany: jest.fn(),
            },
            follow: {
              findMany: jest.fn(),
            },
            user: {
              findMany: jest.fn(),
            },
            post: {
              findMany: jest.fn(),
            },
            reel: {
              findMany: jest.fn(),
            },
            channel: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<RecommendationsService>(RecommendationsService);
    prisma = module.get(PrismaService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('suggestedPeople', () => {
    it('should return popular users when no userId provided', async () => {
      const mockUsers = [
        {
          id: 'user1',
          username: 'user1',
          displayName: 'User One',
          avatarUrl: 'url1',
          isVerified: true,
          bio: 'bio',
          followersCount: 100,
        },
        {
          id: 'user2',
          username: 'user2',
          displayName: 'User Two',
          avatarUrl: 'url2',
          isVerified: false,
          bio: 'bio',
          followersCount: 50,
        },
      ];
      prisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.suggestedPeople(undefined, 20);

      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          isDeactivated: false,
          isPrivate: false,
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isVerified: true,
          bio: true,
          followersCount: true,
        },
        orderBy: { followersCount: 'desc' },
        take: 20,
      }));
      expect(result).toEqual([
        { ...mockUsers[0], mutualFollowers: 0 },
        { ...mockUsers[1], mutualFollowers: 0 },
      ]);
    });

    it('should exclude already-followed users, private, and deactivated users', async () => {
      const userId = 'user123';
      const excludedIds = ['blocked1', 'muted1'];
      // Mock block and mute
      prisma.block.findMany.mockResolvedValue([{ blockedId: 'blocked1' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted1' }]);
      // First follow.findMany call: get myFollowing
      prisma.follow.findMany.mockResolvedValueOnce([
        { followingId: 'followed1' },
        { followingId: 'followed2' },
      ]);
      // Second follow.findMany call: get fofFollows
      prisma.follow.findMany.mockResolvedValueOnce([
        { followingId: 'suggested1' },
        { followingId: 'suggested1' },
        { followingId: 'suggested2' },
      ]);
      // Mock user findMany for suggested users
      const mockSuggestedUsers = [
        {
          id: 'suggested1',
          username: 'suggested1',
          displayName: 'Suggested One',
          avatarUrl: 'url',
          isVerified: false,
          bio: '',
        },
        {
          id: 'suggested2',
          username: 'suggested2',
          displayName: 'Suggested Two',
          avatarUrl: 'url',
          isVerified: false,
          bio: '',
        },
      ];
      prisma.user.findMany.mockResolvedValue(mockSuggestedUsers);

      const result = await service.suggestedPeople(userId, 20);

      // Check excluded IDs are used
      expect(prisma.block.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { blockerId: userId },
        select: { blockedId: true },
      }));
      expect(prisma.mute.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId },
        select: { mutedId: true },
      }));
      // Check first follow call (myFollowing)
      expect(prisma.follow.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
        where: { followerId: userId },
        select: { followingId: true },
      }));
      // Check second follow call (fofFollows)
      expect(prisma.follow.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
        where: {
          followerId: { in: ['followed1', 'followed2'] },
          followingId: { notIn: ['followed1', 'followed2', userId, ...excludedIds] },
        },
        select: { followingId: true },
      }));
      // Check final user query excludes blocked/muted
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          id: { in: ['suggested1', 'suggested2'], notIn: excludedIds },
          isDeactivated: false,
          isPrivate: false,
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isVerified: true,
          bio: true,
        },
      }));
      // Check mutual followers count attached and sorted
      expect(result).toEqual([
        { ...mockSuggestedUsers[0], mutualFollowers: 2 },
        { ...mockSuggestedUsers[1], mutualFollowers: 1 },
      ]);
    });

    it('should exclude private and deactivated users from final list', async () => {
      const userId = 'user123';
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.follow.findMany.mockResolvedValueOnce([]); // myFollowing empty
      prisma.follow.findMany.mockResolvedValueOnce([]); // fofFollows empty
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.suggestedPeople(userId, 20);

      expect(result).toEqual([]);
    });
  });

  describe('suggestedPosts', () => {
    it('should return high-engagement posts from last 48 hours', async () => {
      const mockPosts = [
        {
          id: 'post1',
          postType: 'TEXT',
          content: 'Hello',
          visibility: PostVisibility.PUBLIC,
          mediaUrls: [],
          mediaTypes: [],
          likesCount: 10,
          commentsCount: 5,
          sharesCount: 2,
          createdAt: new Date(),
          user: { id: 'user1', username: 'user1' },
        },
      ];
      prisma.post.findMany.mockResolvedValue(mockPosts);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);

      const result = await service.suggestedPosts(undefined, 20);

      const expectedWhere = {
        isRemoved: false,
        visibility: PostVisibility.PUBLIC,
        scheduledAt: null,
        user: { isDeactivated: false, isPrivate: false },
        createdAt: { gte: expect.any(Date) },
      };
      expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expectedWhere,
        select: expect.any(Object),
        orderBy: [
          { likesCount: 'desc' },
          { commentsCount: 'desc' },
          { sharesCount: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 20,
      }));
      expect(result).toEqual(mockPosts);
    });

    it('should exclude blocked and muted users when userId provided', async () => {
      const userId = 'user123';
      const excludedIds = ['blocked1', 'muted1'];
      prisma.block.findMany.mockResolvedValue([{ blockedId: 'blocked1' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted1' }]);
      prisma.post.findMany.mockResolvedValue([]);

      await service.suggestedPosts(userId, 20);

      expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          userId: { not: userId },
          user: { id: { notIn: excludedIds }, isDeactivated: false, isPrivate: false },
        }),
        select: expect.any(Object),
        orderBy: expect.any(Array),
        take: 20,
      }));
    });

    it('should return empty array when no posts found', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.post.findMany.mockResolvedValue([]);

      const result = await service.suggestedPosts(undefined, 20);

      expect(prisma.post.findMany).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('suggestedReels', () => {
    it('should return engagement-ranked reels from last 72 hours', async () => {
      const mockReels = [
        {
          id: 'reel1',
          videoUrl: 'url',
          thumbnailUrl: 'thumb',
          duration: 15,
          caption: 'test',
          status: ReelStatus.READY,
          likesCount: 100,
          commentsCount: 20,
          sharesCount: 5,
          viewsCount: 1000,
          createdAt: new Date(),
          user: { id: 'user1', username: 'user1' },
        },
      ];
      prisma.reel.findMany.mockResolvedValue(mockReels);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);

      const result = await service.suggestedReels(undefined, 20);

      const expectedWhere = {
        isRemoved: false,
        status: ReelStatus.READY,
        scheduledAt: null,
        user: { isDeactivated: false, isPrivate: false },
        createdAt: { gte: expect.any(Date) },
      };
      expect(prisma.reel.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expectedWhere,
        select: expect.any(Object),
        orderBy: [
          { viewsCount: 'desc' },
          { likesCount: 'desc' },
          { commentsCount: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 20,
      }));
      expect(result).toEqual(mockReels);
    });

    it('should exclude blocked and muted users when userId provided', async () => {
      const userId = 'user123';
      const excludedIds = ['blocked1', 'muted1'];
      prisma.block.findMany.mockResolvedValue([{ blockedId: 'blocked1' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted1' }]);
      prisma.reel.findMany.mockResolvedValue([]);

      await service.suggestedReels(userId, 20);

      expect(prisma.reel.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          userId: { not: userId },
          user: { id: { notIn: excludedIds }, isDeactivated: false, isPrivate: false },
        }),
        select: expect.any(Object),
        orderBy: expect.any(Array),
        take: 20,
      }));
    });

    it('should return empty array when no reels found', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.reel.findMany.mockResolvedValue([]);

      const result = await service.suggestedReels(undefined, 20);

      expect(prisma.reel.findMany).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('suggestedChannels', () => {
    it('should return channels sorted by subscribers', async () => {
      const mockChannels = [
        {
          id: 'channel1',
          userId: 'user1',
          handle: 'channel1',
          name: 'Channel One',
          subscribersCount: 5000,
          totalViews: 100000,
          user: { id: 'user1', username: 'user1' },
        },
      ];
      prisma.channel.findMany.mockResolvedValue(mockChannels);
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);

      const result = await service.suggestedChannels(undefined, 20);

      const expectedWhere = {
        user: { isDeactivated: false },
      };
      expect(prisma.channel.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expectedWhere,
        select: expect.any(Object),
        orderBy: [
          { subscribersCount: 'desc' },
          { totalViews: 'desc' },
        ],
        take: 20,
      }));
      expect(result).toEqual(mockChannels);
    });

    it('should exclude own channel and blocked/muted users when userId provided', async () => {
      const userId = 'user123';
      const excludedIds = ['blocked1', 'muted1'];
      prisma.block.findMany.mockResolvedValue([{ blockedId: 'blocked1' }]);
      prisma.mute.findMany.mockResolvedValue([{ mutedId: 'muted1' }]);
      prisma.channel.findMany.mockResolvedValue([]);

      await service.suggestedChannels(userId, 20);

      expect(prisma.channel.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          userId: { not: userId },
          user: { id: { notIn: excludedIds }, isDeactivated: false },
        }),
        select: expect.any(Object),
        orderBy: expect.any(Array),
        take: 20,
      }));
    });

    it('should return empty array when no channels found', async () => {
      prisma.block.findMany.mockResolvedValue([]);
      prisma.mute.findMany.mockResolvedValue([]);
      prisma.channel.findMany.mockResolvedValue([]);

      const result = await service.suggestedChannels(undefined, 20);

      expect(prisma.channel.findMany).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});
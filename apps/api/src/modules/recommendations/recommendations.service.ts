import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma, ReelStatus, PostVisibility } from '@prisma/client';

const POST_SELECT = {
  id: true,
  postType: true,
  content: true,
  visibility: true,
  mediaUrls: true,
  mediaTypes: true,
  thumbnailUrl: true,
  mediaWidth: true,
  mediaHeight: true,
  hashtags: true,
  mentions: true,
  locationName: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
  savesCount: true,
  viewsCount: true,
  hideLikesCount: true,
  commentsDisabled: true,
  isSensitive: true,
  isRemoved: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
  circle: { select: { id: true, name: true, slug: true } },
};

const THREAD_SELECT = {
  id: true,
  content: true,
  mediaUrls: true,
  mediaTypes: true,
  visibility: true,
  isChainHead: true,
  chainId: true,
  chainPosition: true,
  isQuotePost: true,
  quoteText: true,
  repostOfId: true,
  hashtags: true,
  mentions: true,
  likesCount: true,
  repliesCount: true,
  repostsCount: true,
  quotesCount: true,
  viewsCount: true,
  bookmarksCount: true,
  hideLikesCount: true,
  isPinned: true,
  isSensitive: true,
  isRemoved: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
  circle: { select: { id: true, name: true, slug: true } },
  poll: {
    include: {
      options: {
        orderBy: { position: 'asc' as const },
        include: { _count: { select: { votes: true } } },
      },
    },
  },
  repostOf: {
    select: {
      id: true,
      content: true,
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  },
};

const REEL_SELECT = {
  id: true,
  videoUrl: true,
  thumbnailUrl: true,
  duration: true,
  caption: true,
  mentions: true,
  hashtags: true,
  status: true,
  isRemoved: true,
  audioTrackId: true,
  audioTitle: true,
  audioArtist: true,
  isDuet: true,
  isStitch: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
  viewsCount: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
};

const CHANNEL_SELECT = {
  id: true,
  userId: true,
  handle: true,
  name: true,
  description: true,
  avatarUrl: true,
  bannerUrl: true,
  subscribersCount: true,
  videosCount: true,
  totalViews: true,
  isVerified: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
};

@Injectable()
export class RecommendationsService {
  constructor(private prisma: PrismaService) {}

  private async getExcludedUserIds(userId: string): Promise<string[]> {
    const [blocks, mutes] = await Promise.all([
      this.prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
      this.prisma.mute.findMany({ where: { userId }, select: { mutedId: true } }),
    ]);
    return [
      ...blocks.map(b => b.blockedId),
      ...mutes.map(m => m.mutedId),
    ];
  }

  async suggestedPeople(userId?: string, limit = 20) {
    // If no authenticated user, return popular users
    if (!userId) {
      const users = await this.prisma.user.findMany({
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
        take: limit,
      });
      return users.map(u => ({ ...u, mutualFollowers: 0 }));
    }

    // Get blocked/muted users to exclude
    const excludedIds = await this.getExcludedUserIds(userId);

    // Friends-of-friends algorithm
    // 1. Get IDs I follow
    const myFollowing = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const myFollowingIds = myFollowing.map(f => f.followingId);

    // 2. Get people my follows also follow (friends-of-friends)
    const fofFollows = await this.prisma.follow.findMany({
      where: {
        followerId: { in: myFollowingIds },
        followingId: { notIn: [...myFollowingIds, userId, ...excludedIds] },
      },
      select: { followingId: true },
    });

    // 3. Count mutual connections per suggested user
    const mutualCount = new Map<string, number>();
    for (const f of fofFollows) {
      mutualCount.set(f.followingId, (mutualCount.get(f.followingId) || 0) + 1);
    }

    // 4. Sort by mutual count, take top N
    const sortedIds = [...mutualCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    // 5. Fetch user profiles (also exclude blocked/muted)
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: sortedIds, notIn: excludedIds },
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
    });

    // Re-sort by mutual count and attach count
    return users
      .map(u => ({ ...u, mutualFollowers: mutualCount.get(u.id) || 0 }))
      .sort((a, b) => b.mutualFollowers - a.mutualFollowers);
  }

  async suggestedPosts(userId?: string, limit = 20) {
    const where: Prisma.PostWhereInput = {
      isRemoved: false,
      visibility: PostVisibility.PUBLIC,
      scheduledAt: null,
      user: { isDeactivated: false, isPrivate: false },
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }, // last 48h
    };
    if (userId) {
      where.userId = { not: userId };
      const excludedIds = await this.getExcludedUserIds(userId);
      if (excludedIds.length) {
        where.user = { ...(where.user as Prisma.UserWhereInput), id: { notIn: excludedIds } };
      }
    }

    const posts = await this.prisma.post.findMany({
      where,
      select: POST_SELECT,
      orderBy: [
        { likesCount: 'desc' },
        { commentsCount: 'desc' },
        { sharesCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });
    return posts;
  }

  async suggestedReels(userId?: string, limit = 20) {
    const where: Prisma.ReelWhereInput = {
      isRemoved: false,
      status: ReelStatus.READY,
      scheduledAt: null,
      user: { isDeactivated: false, isPrivate: false },
      createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) }, // last 72h
    };
    if (userId) {
      where.userId = { not: userId };
      const excludedIds = await this.getExcludedUserIds(userId);
      if (excludedIds.length) {
        where.user = { ...(where.user as Prisma.UserWhereInput), id: { notIn: excludedIds } };
      }
    }

    const reels = await this.prisma.reel.findMany({
      where,
      select: REEL_SELECT,
      orderBy: [
        { viewsCount: 'desc' },
        { likesCount: 'desc' },
        { commentsCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });
    return reels;
  }

  async suggestedChannels(userId?: string, limit = 20) {
    const where: Prisma.ChannelWhereInput = {
      user: { isDeactivated: false },
    };
    // If authenticated, exclude user's own channel and blocked/muted users
    if (userId) {
      where.userId = { not: userId };
      const excludedIds = await this.getExcludedUserIds(userId);
      if (excludedIds.length) {
        where.user = { ...(where.user as Prisma.UserWhereInput), id: { notIn: excludedIds } };
      }
    }

    const channels = await this.prisma.channel.findMany({
      where,
      select: CHANNEL_SELECT,
      orderBy: [
        { subscribersCount: 'desc' },
        { totalViews: 'desc' },
      ],
      take: limit,
    });
    return channels;
  }
}
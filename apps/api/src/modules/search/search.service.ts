import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

const USER_SEARCH_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  isVerified: true,
  _count: { select: { followers: true } },
};

const THREAD_SEARCH_SELECT = {
  id: true,
  content: true,
  mediaUrls: true,
  likesCount: true,
  repliesCount: true,
  repostsCount: true,
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

const POST_SEARCH_SELECT = {
  id: true,
  postType: true,
  content: true,
  mediaUrls: true,
  mediaTypes: true,
  likesCount: true,
  commentsCount: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      username: true,
      avatarUrl: true,
    },
  },
};

const REEL_SEARCH_SELECT = {
  id: true,
  videoUrl: true,
  thumbnailUrl: true,
  duration: true,
  caption: true,
  mentions: true,
  likesCount: true,
  commentsCount: true,
  sharesCount: true,
  viewsCount: true,
  status: true,
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

const VIDEO_SEARCH_SELECT = {
  id: true,
  title: true,
  description: true,
  thumbnailUrl: true,
  duration: true,
  category: true,
  tags: true,
  viewsCount: true,
  likesCount: true,
  dislikesCount: true,
  commentsCount: true,
  publishedAt: true,
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
  channel: {
    select: {
      id: true,
      handle: true,
      name: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
};

const CHANNEL_SEARCH_SELECT = {
  id: true,
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
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(
    query: string,
    type?: 'people' | 'threads' | 'posts' | 'tags' | 'reels' | 'videos' | 'channels',
    cursor?: string,
    limit = 20,
  ) {
    // If type is specified and is 'posts', 'threads', 'reels', 'videos', or 'channels', return paginated response
    if (type === 'posts' || type === 'threads' || type === 'reels' || type === 'videos' || type === 'channels') {
      const take = limit + 1; // Fetch one extra to check if there's more

      if (type === 'posts') {
        const posts = await this.prisma.post.findMany({
          where: {
            content: { contains: query, mode: 'insensitive' },
            visibility: 'PUBLIC',
            isRemoved: false,
          },
          select: POST_SEARCH_SELECT,
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { likesCount: 'desc' },
        });

        const hasMore = posts.length > limit;
        const items = hasMore ? posts.slice(0, limit) : posts;
        return {
          data: items,
          meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
        };
      } else if (type === 'threads') {
        const threads = await this.prisma.thread.findMany({
          where: {
            content: { contains: query, mode: 'insensitive' },
            visibility: 'PUBLIC',
            isChainHead: true,
            isRemoved: false,
          },
          select: THREAD_SEARCH_SELECT,
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { likesCount: 'desc' },
        });

        const hasMore = threads.length > limit;
        const items = hasMore ? threads.slice(0, limit) : threads;
        return {
          data: items,
          meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
        };
      } else if (type === 'videos') {
        const videos = await this.prisma.video.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
            ],
            status: 'PUBLISHED',
          },
          select: VIDEO_SEARCH_SELECT,
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { viewsCount: 'desc' },
        });

        const hasMore = videos.length > limit;
        const items = hasMore ? videos.slice(0, limit) : videos;
        return {
          data: items,
          meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
        };
      } else if (type === 'channels') {
        const channels = await this.prisma.channel.findMany({
          where: {
            OR: [
              { handle: { contains: query, mode: 'insensitive' } },
              { name: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
            ],
          },
          select: CHANNEL_SEARCH_SELECT,
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { subscribersCount: 'desc' },
        });

        const hasMore = channels.length > limit;
        const items = hasMore ? channels.slice(0, limit) : channels;
        return {
          data: items,
          meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
        };
      } else { // reels
        const reels = await this.prisma.reel.findMany({
          where: {
            caption: { contains: query, mode: 'insensitive' },
            status: 'READY',
          },
          select: REEL_SEARCH_SELECT,
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { createdAt: 'desc' },
        });

        const hasMore = reels.length > limit;
        const items = hasMore ? reels.slice(0, limit) : reels;
        return {
          data: items,
          meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
        };
      }
    }

    // For people, tags, or no type specified, return the aggregate SearchResults format
    // At this point, type is narrowed to 'people' | 'tags' | undefined
    const results: any = {};
    const isAggregate = !type;

    if (isAggregate || type === 'people') {
      results.people = await this.prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: USER_SEARCH_SELECT,
        take: isAggregate ? 5 : limit,
        orderBy: { followers: { _count: 'desc' } },
      });
    }

    if (isAggregate) {
      results.threads = await this.prisma.thread.findMany({
        where: {
          content: { contains: query, mode: 'insensitive' },
          visibility: 'PUBLIC',
          isChainHead: true,
          isRemoved: false,
        },
        select: THREAD_SEARCH_SELECT,
        take: 5,
        orderBy: { likesCount: 'desc' },
      });

      results.posts = await this.prisma.post.findMany({
        where: {
          content: { contains: query, mode: 'insensitive' },
          visibility: 'PUBLIC',
          isRemoved: false,
        },
        select: POST_SEARCH_SELECT,
        take: 5,
        orderBy: { likesCount: 'desc' },
      });

      results.reels = await this.prisma.reel.findMany({
        where: {
          caption: { contains: query, mode: 'insensitive' },
          status: 'READY',
        },
        select: REEL_SEARCH_SELECT,
        take: 5,
        orderBy: { likesCount: 'desc' },
      });

      results.videos = await this.prisma.video.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
          status: 'PUBLISHED',
        },
        select: VIDEO_SEARCH_SELECT,
        take: 5,
        orderBy: { viewsCount: 'desc' },
      });

      results.channels = await this.prisma.channel.findMany({
        where: {
          OR: [
            { handle: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: CHANNEL_SEARCH_SELECT,
        take: 5,
        orderBy: { subscribersCount: 'desc' },
      });
    }

    if (!type || type === 'tags') {
      results.hashtags = await this.prisma.hashtag.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        take: type ? limit : 10,
        orderBy: { postsCount: 'desc' },
      });
    }

    return results;
  }

  async trending() {
    const [hashtags, threads] = await Promise.all([
      this.prisma.hashtag.findMany({
        take: 20,
        orderBy: { postsCount: 'desc' },
      }),
      this.prisma.thread.findMany({
        where: {
          visibility: 'PUBLIC',
          isChainHead: true,
          isRemoved: false,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        select: THREAD_SEARCH_SELECT,
        take: 10,
        orderBy: { likesCount: 'desc' },
      }),
    ]);
    return { hashtags, threads };
  }

  async getHashtagPosts(tag: string, cursor?: string, limit = 20) {
    // Try exact hashtag record first for metadata
    const hashtag = await this.prisma.hashtag.findUnique({ where: { name: tag.toLowerCase() } });

    const posts = await this.prisma.post.findMany({
      where: {
        hashtags: { has: tag.toLowerCase() },
        visibility: 'PUBLIC',
        isRemoved: false,
      },
      select: POST_SEARCH_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    return {
      hashtag,
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async suggestedUsers(userId: string) {
    const myFollowing = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const myFollowingIds = myFollowing.map((f) => f.followingId);

    return this.prisma.user.findMany({
      where: {
        id: { notIn: [...myFollowingIds, userId] },
        isPrivate: false,
        isDeactivated: false,
      },
      select: USER_SEARCH_SELECT,
      take: 20,
      orderBy: { followers: { _count: 'desc' } },
    });
  }
}

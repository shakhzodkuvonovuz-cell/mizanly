import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { MeilisearchService } from './meilisearch.service';

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

export interface SearchResults {
  people?: Prisma.UserGetPayload<{ select: typeof USER_SEARCH_SELECT }>[];
  threads?: Prisma.ThreadGetPayload<{ select: typeof THREAD_SEARCH_SELECT }>[];
  posts?: Prisma.PostGetPayload<{ select: typeof POST_SEARCH_SELECT }>[];
  reels?: Prisma.ReelGetPayload<{ select: typeof REEL_SEARCH_SELECT }>[];
  videos?: Prisma.VideoGetPayload<{ select: typeof VIDEO_SEARCH_SELECT }>[];
  channels?: Prisma.ChannelGetPayload<{ select: typeof CHANNEL_SEARCH_SELECT }>[];
  hashtags?: Prisma.HashtagGetPayload<{}>[];
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private prisma: PrismaService,
    private meilisearch: MeilisearchService,
  ) {}

  async search(
    query: string,
    type?: 'people' | 'threads' | 'posts' | 'tags' | 'reels' | 'videos' | 'channels',
    cursor?: string,
    limit = 20,
  ) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Search query is required');
    }
    if (query.length > 200) {
      throw new BadRequestException('Search query must be under 200 characters');
    }
    // Ensure limit is a number and capped (F01+F02: fix safeLimit not used + string type)
    const numLimit = typeof limit === 'string' ? parseInt(limit as unknown as string, 10) || 20 : limit;
    const safeLimit = Math.min(Math.max(numLimit, 1), 50);

    // Try Meilisearch first (faster, typo tolerant, Arabic-aware)
    if (this.meilisearch.isAvailable() && type && !cursor) {
      const indexMap: Record<string, string> = {
        people: 'users', posts: 'posts', threads: 'threads',
        reels: 'reels', videos: 'videos', tags: 'hashtags',
      };
      const indexName = indexMap[type];
      if (indexName) {
        const result = await this.meilisearch.search(indexName, query, { limit: safeLimit });
        if (result && result.hits.length > 0) {
          return { data: result.hits, meta: { hasMore: result.hits.length === safeLimit, cursor: undefined } };
        }
      }
      // Fall through to Prisma if Meilisearch returns no results
    }

    // If type is specified and is 'posts', 'threads', 'reels', 'videos', or 'channels', return paginated response
    if (type === 'posts' || type === 'threads' || type === 'reels' || type === 'videos' || type === 'channels') {
      const take = safeLimit + 1; // Fetch one extra to check if there's more

      if (type === 'posts') {
        const posts = await this.prisma.post.findMany({
          where: {
            content: { contains: query, mode: 'insensitive' },
            visibility: 'PUBLIC',
            isRemoved: false,
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
          },
          select: POST_SEARCH_SELECT,
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { likesCount: 'desc' },
        });

        const hasMore = posts.length > safeLimit;
        const items = hasMore ? posts.slice(0, safeLimit) : posts;
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
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
          },
          select: THREAD_SEARCH_SELECT,
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { likesCount: 'desc' },
        });

        const hasMore = threads.length > safeLimit;
        const items = hasMore ? threads.slice(0, safeLimit) : threads;
        return {
          data: items,
          meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
        };
      } else if (type === 'videos') {
        const videos = await this.prisma.video.findMany({
          where: {
            AND: [
              { OR: [{ title: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] },
              { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
            ],
            status: 'PUBLISHED',
            isRemoved: false,
          },
          select: VIDEO_SEARCH_SELECT,
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { viewsCount: 'desc' },
        });

        const hasMore = videos.length > safeLimit;
        const items = hasMore ? videos.slice(0, safeLimit) : videos;
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
            // Filter out channels owned by banned or deleted users
            user: { isBanned: false, isDeleted: false, isDeactivated: false },
          },
          select: CHANNEL_SEARCH_SELECT,
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { subscribersCount: 'desc' },
        });

        const hasMore = channels.length > safeLimit;
        const items = hasMore ? channels.slice(0, safeLimit) : channels;
        return {
          data: items,
          meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
        };
      } else { // reels
        const reels = await this.prisma.reel.findMany({
          where: {
            caption: { contains: query, mode: 'insensitive' },
            status: 'READY',
            isRemoved: false,
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
            isTrial: false,
          },
          select: REEL_SEARCH_SELECT,
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { createdAt: 'desc' },
        });

        const hasMore = reels.length > safeLimit;
        const items = hasMore ? reels.slice(0, safeLimit) : reels;
        return {
          data: items,
          meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
        };
      }
    }

    // For people, tags, or no type specified, return the aggregate SearchResults format.
    // PERFORMANCE NOTE: When Meilisearch is not deployed (MEILISEARCH_HOST empty), each
    // content type runs a Prisma ILIKE '%query%' full-text scan. At scale, deploy
    // Meilisearch (see docs/DEPLOYMENT.md) to use pre-indexed search instead of 7
    // parallel table scans. The MeilisearchService is already wired up — just set
    // MEILISEARCH_HOST and MEILISEARCH_API_KEY in the environment.
    const results: SearchResults = {};
    const isAggregate = !type;

    if (isAggregate || type === 'people') {
      results.people = await this.prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } },
          ],
          isBanned: false,
          isDeactivated: false,
          isDeleted: false,
        },
        select: USER_SEARCH_SELECT,
        take: isAggregate ? 5 : safeLimit,
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
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
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
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        },
        select: POST_SEARCH_SELECT,
        take: 5,
        orderBy: { likesCount: 'desc' },
      });

      results.reels = await this.prisma.reel.findMany({
        where: {
          caption: { contains: query, mode: 'insensitive' },
          status: 'READY',
          isRemoved: false,
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
          isTrial: false,
        },
        select: REEL_SEARCH_SELECT,
        take: 5,
        orderBy: { likesCount: 'desc' },
      });

      results.videos = await this.prisma.video.findMany({
        where: {
          AND: [
            { OR: [{ title: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] },
            { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
          ],
          status: 'PUBLISHED',
          isRemoved: false,
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
          // Filter out channels owned by banned or deleted users
          user: { isBanned: false, isDeleted: false, isDeactivated: false },
        },
        select: CHANNEL_SEARCH_SELECT,
        take: 5,
        orderBy: { subscribersCount: 'desc' },
      });
    }

    if (!type || type === 'tags') {
      results.hashtags = await this.prisma.hashtag.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        take: type ? safeLimit : 10,
        orderBy: { postsCount: 'desc' },
      });
    }

    return results;
  }

  async trending() {
    // Trending hashtags: SQL aggregation using unnest across Posts AND Threads
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const topTags = await this.prisma.$queryRaw<Array<{ tag: string; cnt: bigint }>>`
      SELECT tag, SUM(cnt) as cnt FROM (
        SELECT unnest(hashtags) as tag, COUNT(*) as cnt
        FROM "Post"
        WHERE "createdAt" >= ${twentyFourHoursAgo}
          AND array_length(hashtags, 1) > 0
          AND ("scheduledAt" IS NULL OR "scheduledAt" <= NOW())
        GROUP BY tag
        UNION ALL
        SELECT unnest(hashtags) as tag, COUNT(*) as cnt
        FROM "Thread"
        WHERE "createdAt" >= ${twentyFourHoursAgo}
          AND array_length(hashtags, 1) > 0
          AND ("scheduledAt" IS NULL OR "scheduledAt" <= NOW())
        GROUP BY tag
      ) combined
      GROUP BY tag
      ORDER BY cnt DESC
      LIMIT 20
    `;

    const topTagNames = topTags.map(t => t.tag);
    const hashtagRecords = topTagNames.length > 0
      ? await this.prisma.hashtag.findMany({ where: { name: { in: topTagNames } }, take: 50 })
      : [];

    // Merge recent count from SQL aggregation into hashtag records
    const freqMap = new Map(topTags.map(t => [t.tag, Number(t.cnt)]));
    const hashtags = hashtagRecords.map(record => ({
      ...record,
      recentCount: freqMap.get(record.name) || 0,
    })).sort((a, b) => b.recentCount - a.recentCount);

    // Threads stays the same (already engagement-sorted)
    const threads = await this.prisma.thread.findMany({
      where: {
        visibility: 'PUBLIC',
        isChainHead: true,
        isRemoved: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: THREAD_SEARCH_SELECT,
      take: 10,
      orderBy: { likesCount: 'desc' },
    });

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
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
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
      take: 1000,
    });
    const myFollowingIds = myFollowing.map((f) => f.followingId);

    // Get user's interests
    const userInterests = await this.prisma.userInterest.findMany({
      where: { userId },
      select: { category: true },
      take: 50,
    });
    const interestCategories = userInterests.map(ui => ui.category);

    return this.prisma.user.findMany({
      where: {
        id: { notIn: [...myFollowingIds, userId] },
        isPrivate: false,
        isDeactivated: false,
        isBanned: false,
        isDeleted: false,
        // If user has interests, filter by shared interests
        ...(interestCategories.length > 0 ? {
          interests: { some: { category: { in: interestCategories } } },
        } : {}),
      },
      select: USER_SEARCH_SELECT,
      take: 20,
      orderBy: { followers: { _count: 'desc' } },
    });
  }

  async searchPosts(query: string, userId?: string, cursor?: string, limit = 20) {
    const safeLim = Math.min(Math.max(typeof limit === 'string' ? parseInt(limit as unknown as string, 10) : limit, 1), 50);
    const take = safeLim + 1;
    const posts = await this.prisma.post.findMany({
      where: {
        content: { contains: query, mode: 'insensitive' },
        visibility: 'PUBLIC',
        isRemoved: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      },
      select: POST_SEARCH_SELECT,
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { likesCount: 'desc' },
    });
    const hasMore = posts.length > limit;
    const data = hasMore ? posts.slice(0, limit) : posts;
    return { data, meta: { cursor: data[data.length - 1]?.id ?? null, hasMore } };
  }

  async searchThreads(query: string, cursor?: string, limit = 20) {
    const safeLim = Math.min(Math.max(typeof limit === 'string' ? parseInt(limit as unknown as string, 10) : limit, 1), 50);
    const take = safeLim + 1;
    const threads = await this.prisma.thread.findMany({
      where: {
        content: { contains: query, mode: 'insensitive' },
        visibility: 'PUBLIC',
        isChainHead: true,
        isRemoved: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      },
      select: THREAD_SEARCH_SELECT,
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { likesCount: 'desc' },
    });
    const hasMore = threads.length > limit;
    const data = hasMore ? threads.slice(0, limit) : threads;
    return { data, meta: { cursor: data[data.length - 1]?.id ?? null, hasMore } };
  }

  async searchReels(query: string, cursor?: string, limit = 20) {
    const safeLim = Math.min(Math.max(limit, 1), 50);
    const take = safeLim + 1;
    const reels = await this.prisma.reel.findMany({
      where: {
        AND: [
          { OR: [{ caption: { contains: query, mode: 'insensitive' } }, { hashtags: { has: query.toLowerCase() } }] },
          { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
        ],
        status: 'READY',
        isRemoved: false,
        isTrial: false,
      },
      select: REEL_SEARCH_SELECT,
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    const hasMore = reels.length > limit;
    const data = hasMore ? reels.slice(0, limit) : reels;
    return { data, meta: { cursor: data[data.length - 1]?.id ?? null, hasMore } };
  }

  async getExploreFeed(cursor?: string, limit = 20, userId?: string) {
    const take = limit + 1;

    // Exclude blocked/muted users when authenticated
    let userFilter = {};
    if (userId) {
      const [blocks, mutes] = await Promise.all([
        this.prisma.block.findMany({
          where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
          select: { blockerId: true, blockedId: true },
          take: 50,
        }),
        this.prisma.mute.findMany({
          where: { userId },
          select: { mutedId: true },
          take: 50,
        }),
      ]);
      const excluded = new Set<string>();
      for (const b of blocks) {
        if (b.blockerId === userId) excluded.add(b.blockedId);
        else excluded.add(b.blockerId);
      }
      for (const m of mutes) excluded.add(m.mutedId);
      if (excluded.size > 0) {
        userFilter = { id: { notIn: [...excluded] } };
      }
    }

    const posts = await this.prisma.post.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        visibility: 'PUBLIC',
        isRemoved: false,
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        user: { isDeactivated: false, ...userFilter },
        ...(userId ? { userId: { not: userId } } : {}),
      },
      select: POST_SEARCH_SELECT,
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { likesCount: 'desc' },
    });
    const hasMore = posts.length > limit;
    const data = hasMore ? posts.slice(0, limit) : posts;
    return { data, meta: { cursor: data[data.length - 1]?.id ?? null, hasMore } };
  }

  async getSuggestions(query: string, limit = 10) {
    if (!query || query.trim().length === 0) {
      return { users: [], hashtags: [] };
    }
    const safeLimit = Math.min(Math.max(limit, 1), 20);
    const [users, hashtags] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          OR: [
            { username: { startsWith: query, mode: 'insensitive' } },
            { displayName: { startsWith: query, mode: 'insensitive' } },
          ],
          isBanned: false,
          isDeactivated: false,
          isDeleted: false,
        },
        select: USER_SEARCH_SELECT,
        take: Math.ceil(safeLimit / 2),
        orderBy: { followers: { _count: 'desc' } },
      }),
      this.prisma.hashtag.findMany({
        where: { name: { startsWith: query, mode: 'insensitive' } },
        take: Math.ceil(safeLimit / 2),
        orderBy: { postsCount: 'desc' },
      }),
    ]);
    return { users, hashtags };
  }
}

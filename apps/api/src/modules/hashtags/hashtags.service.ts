import {
  Injectable,
  NotFoundException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { Prisma } from '@prisma/client';
import { cacheAside } from '../../common/utils/cache';
import { enrichPostsForUser, enrichReelsForUser } from '../../common/utils/enrich';

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

type PostWithUser = Prisma.PostGetPayload<{ select: typeof POST_SELECT }>;
type ReelWithUser = Prisma.ReelGetPayload<{ select: typeof REEL_SELECT }>;
type ThreadWithUser = Prisma.ThreadGetPayload<{ select: typeof THREAD_SELECT }>;

type EnrichedPost = PostWithUser & { userReaction: string | null; isSaved: boolean };
type EnrichedReel = ReelWithUser & { userReaction: string | null; isSaved: boolean };
type EnrichedThread = ThreadWithUser & { userReaction: string | null; isSaved: boolean };

@Injectable()
export class HashtagsService {
  private readonly logger = new Logger(HashtagsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async getTrendingRaw(limit = 50) {
    // Cache trending hashtags for 5 minutes (expensive query, slow-changing data)
    return cacheAside(this.redis, `trending:hashtags:${limit}`, 300, () => this.fetchTrendingHashtags(limit));
  }

  private async fetchTrendingHashtags(limit: number) {
    const hashtags = await this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      postsCount: number;
      reelsCount: number;
      threadsCount: number;
      videosCount: number;
      total: number;
    }>>`
      SELECT
        id,
        name,
        "postsCount",
        "reelsCount",
        "threadsCount",
        "videosCount",
        ("postsCount" + "reelsCount" + "threadsCount" + "videosCount") as total
      FROM "hashtags"
      ORDER BY total DESC, "postsCount" DESC
      LIMIT ${limit}
    `;
    return hashtags;
  }

  async search(query: string, limit = 20) {
    const hashtags = await this.prisma.hashtag.findMany({
      where: {
        name: {
          startsWith: query,
          mode: 'insensitive',
        },
      },
      take: limit,
      orderBy: { postsCount: 'desc' },
    });
    return hashtags;
  }

  async getByName(name: string) {
    const hashtag = await this.prisma.hashtag.findUnique({
      where: { name },
    });
    if (!hashtag) throw new NotFoundException('Hashtag not found');
    return hashtag;
  }

  async getPostsByHashtag(
    hashtagName: string,
    userId?: string,
    cursor?: string,
    limit = 20,
  ) {
    const hashtag = await this.prisma.hashtag.findUnique({
      where: { name: hashtagName },
    });
    if (!hashtag) throw new NotFoundException('Hashtag not found');

    const posts = await this.prisma.post.findMany({
      where: {
        hashtags: { has: hashtagName },
        isRemoved: false,
        visibility: 'PUBLIC',
      },
      select: POST_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = posts.length > limit;
    const data = hasMore ? posts.slice(0, limit) : posts;

    // Enrich with user reaction and saved status if userId provided
    const enriched = userId ? await this.enrichPosts(data, userId) : data;

    return {
      data: enriched,
      meta: { cursor: hasMore ? data[data.length - 1]?.id ?? null : null, hasMore },
    };
  }

  async getReelsByHashtag(
    hashtagName: string,
    userId?: string,
    cursor?: string,
    limit = 20,
  ) {
    const hashtag = await this.prisma.hashtag.findUnique({
      where: { name: hashtagName },
    });
    if (!hashtag) throw new NotFoundException('Hashtag not found');

    const reels = await this.prisma.reel.findMany({
      where: {
        hashtags: { has: hashtagName },
        isRemoved: false,
        status: 'READY',
      },
      select: REEL_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = reels.length > limit;
    const data = hasMore ? reels.slice(0, limit) : reels;

    // Enrich with user reaction and saved status if userId provided
    const enriched = userId ? await this.enrichReels(data, userId) : data;

    return {
      data: enriched,
      meta: { cursor: hasMore ? data[data.length - 1]?.id ?? null : null, hasMore },
    };
  }

  async getThreadsByHashtag(
    hashtagName: string,
    userId?: string,
    cursor?: string,
    limit = 20,
  ) {
    const hashtag = await this.prisma.hashtag.findUnique({
      where: { name: hashtagName },
    });
    if (!hashtag) throw new NotFoundException('Hashtag not found');

    const threads = await this.prisma.thread.findMany({
      where: {
        hashtags: { has: hashtagName },
        isRemoved: false,
        visibility: 'PUBLIC',
      },
      select: THREAD_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = threads.length > limit;
    const data = hasMore ? threads.slice(0, limit) : threads;

    // Enrich with user reaction and saved status if userId provided
    const enriched = userId ? await this.enrichThreads(data, userId) : data;

    return {
      data: enriched,
      meta: { cursor: hasMore ? data[data.length - 1]?.id ?? null : null, hasMore },
    };
  }

  async incrementCount(name: string, field: 'postsCount' | 'reelsCount' | 'threadsCount' | 'videosCount') {
    await this.prisma.hashtag.upsert({
      where: { name },
      create: { name, [field]: 1 },
      update: { [field]: { increment: 1 } },
    });
  }

  async decrementCount(name: string, field: 'postsCount' | 'reelsCount' | 'threadsCount' | 'videosCount') {
    try {
      await this.prisma.hashtag.update({
        where: { name },
        data: { [field]: { decrement: 1 } },
      });
      // Ensure count doesn't go negative
      await this.prisma.hashtag.updateMany({
        where: { name, [field]: { lt: 0 } },
        data: { [field]: 0 },
      });
    } catch {
      this.logger.warn(`Failed to decrement ${field} for hashtag ${name}`);
    }
  }

  /** Enrich posts with user-specific reaction/saved status (delegates to shared utility) */
  private async enrichPosts(posts: PostWithUser[], userId: string): Promise<EnrichedPost[]> {
    return enrichPostsForUser(this.prisma, posts, userId) as Promise<EnrichedPost[]>;
  }

  /** Enrich reels with user-specific reaction/saved status (delegates to shared utility) */
  private async enrichReels(reels: ReelWithUser[], userId: string): Promise<EnrichedReel[]> {
    return enrichReelsForUser(this.prisma, reels, userId) as Promise<EnrichedReel[]>;
  }

  async followHashtag(userId: string, hashtagId: string) {
    const hashtag = await this.prisma.hashtag.findUnique({ where: { id: hashtagId } });
    if (!hashtag) throw new NotFoundException('Hashtag not found');
    await this.prisma.hashtagFollow.upsert({
      where: { userId_hashtagId: { userId, hashtagId } },
      create: { userId, hashtagId },
      update: {},
    });
    return { followed: true };
  }

  async unfollowHashtag(userId: string, hashtagId: string) {
    await this.prisma.hashtagFollow.deleteMany({ where: { userId, hashtagId } });
    return { followed: false };
  }

  async getFollowedHashtags(userId: string, cursor?: string, limit = 20) {
    const follows = await this.prisma.hashtagFollow.findMany({
      where: { userId },
      take: limit + 1,
      ...(cursor ? { cursor: { userId_hashtagId: { userId, hashtagId: cursor } }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    const hasMore = follows.length > limit;
    const items = hasMore ? follows.slice(0, limit) : follows;
    const hashtagIds = items.map(f => f.hashtagId);
    const hashtags = hashtagIds.length > 0
      ? await this.prisma.hashtag.findMany({
          where: { id: { in: hashtagIds } },
          select: { id: true, name: true, postsCount: true },
        })
      : [];
    const hashtagMap = new Map(hashtags.map(h => [h.id, h]));
    return {
      data: items.map(f => hashtagMap.get(f.hashtagId)).filter(Boolean),
      meta: { cursor: hasMore ? items[items.length - 1].hashtagId : null, hasMore },
    };
  }

  private async enrichThreads(threads: ThreadWithUser[], userId: string): Promise<EnrichedThread[]> {
    const threadIds = threads.map(t => t.id);
    const [reactions, saved] = await Promise.all([
      this.prisma.threadReaction.findMany({
        where: { userId, threadId: { in: threadIds } },
      take: 50,
    }),
      this.prisma.threadBookmark.findMany({
        where: { userId, threadId: { in: threadIds } },
      take: 50,
    }),
    ]);
    const reactionMap = new Map(reactions.map((r: { threadId: string; reaction: string }) => [r.threadId, r.reaction]));
    const savedSet = new Set(saved.map((s: { threadId: string }) => s.threadId));
    return threads.map(thread => ({
      ...thread,
      userReaction: reactionMap.get(thread.id) ?? null,
      isSaved: savedSet.has(thread.id),
    }));
  }
}
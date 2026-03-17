import {
  Injectable,
  NotFoundException,
  Logger,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import Redis from 'ioredis';
import { Prisma } from '@prisma/client';

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
    // Raw SQL to sum all counts and order by total engagement
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
    await this.prisma.hashtag.update({
      where: { name },
      data: { [field]: { decrement: 1 } },
    }).catch(() => {
      // Hashtag may not exist if counts got out of sync, ignore
      this.logger.warn(`Failed to decrement ${field} for hashtag ${name}`);
    });
  }

  private async enrichPosts(posts: PostWithUser[], userId: string): Promise<EnrichedPost[]> {
    const postIds = posts.map(p => p.id);
    const [reactions, saved] = await Promise.all([
      this.prisma.postReaction.findMany({
        where: { userId, postId: { in: postIds } },
      }),
      this.prisma.savedPost.findMany({
        where: { userId, postId: { in: postIds } },
      }),
    ]);
    const reactionMap = new Map(reactions.map((r: { postId: string; reaction: string }) => [r.postId, r.reaction]));
    const savedSet = new Set(saved.map((s: { postId: string }) => s.postId));
    return posts.map(post => ({
      ...post,
      userReaction: reactionMap.get(post.id) ?? null,
      isSaved: savedSet.has(post.id),
    }));
  }

  private async enrichReels(reels: ReelWithUser[], userId: string): Promise<EnrichedReel[]> {
    const reelIds = reels.map(r => r.id);
    const [reactions, saved] = await Promise.all([
      this.prisma.reelReaction.findMany({
        where: { userId, reelId: { in: reelIds } },
      }),
      this.prisma.reelInteraction.findMany({
        where: { userId, reelId: { in: reelIds }, saved: true },
      }),
    ]);
    const reactionMap = new Map(reactions.map((r: { reelId: string; reaction: string }) => [r.reelId, r.reaction]));
    const savedSet = new Set(saved.map((s: { reelId: string }) => s.reelId));
    return reels.map(reel => ({
      ...reel,
      userReaction: reactionMap.get(reel.id) ?? null,
      isSaved: savedSet.has(reel.id),
    }));
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
    const data = hasMore ? follows.slice(0, limit) : follows;
    const hashtagIds = data.map(f => f.hashtagId);
    const hashtags = await this.prisma.hashtag.findMany({
      where: { id: { in: hashtagIds } },
      select: { id: true, name: true, postsCount: true },
    });
    return {
      data: hashtags,
      meta: { cursor: hasMore ? data[data.length - 1].hashtagId : null, hasMore },
    };
  }

  private async enrichThreads(threads: ThreadWithUser[], userId: string): Promise<EnrichedThread[]> {
    const threadIds = threads.map(t => t.id);
    const [reactions, saved] = await Promise.all([
      this.prisma.threadReaction.findMany({
        where: { userId, threadId: { in: threadIds } },
      }),
      this.prisma.threadBookmark.findMany({
        where: { userId, threadId: { in: threadIds } },
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
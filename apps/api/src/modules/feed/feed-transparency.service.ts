import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { getExcludedUserIds } from '../../common/utils/excluded-users';
import Redis from 'ioredis';

export interface ExplainResult {
  reasons: string[];
}

interface EnhancedSearchPost {
  id: string;
  content: string | null;
  likesCount: number;
  createdAt: Date;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface EnhancedSearchResult {
  data: EnhancedSearchPost[];
  meta: { cursor: string | null; hasMore: boolean };
}

const ENHANCED_POST_SELECT = {
  id: true,
  content: true,
  likesCount: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  },
} as const;

@Injectable()
export class FeedTransparencyService {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  private static readonly ISLAMIC_TAGS = new Set([
    'quran', 'hadith', 'sunnah', 'islam', 'muslim', 'dua', 'salah', 'ramadan',
    'jummah', 'eid', 'hajj', 'umrah', 'zakat', 'sadaqah', 'dawah', 'seerah',
    'tafsir', 'fiqh', 'aqeedah', 'dhikr', 'halal', 'masjid', 'islamic',
  ]);

  async explainPost(userId: string, postId: string): Promise<ExplainResult> {
    const reasons: string[] = [];
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        userId: true,
        likesCount: true,
        commentsCount: true,
        sharesCount: true,
        viewsCount: true,
        content: true,
        hashtags: true,
        createdAt: true,
        user: { select: { username: true } },
      },
    });
    if (!post || !post.userId) return { reasons: ['Post not found'] };

    // Check if user follows the author
    const follows = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: post.userId,
        },
      },
    });
    if (follows) {
      reasons.push(`Posted by @${post.user?.username ?? 'unknown'}, who you follow`);
    }

    // Check engagement
    if (post.likesCount > 100) {
      reasons.push(`Popular post with ${post.likesCount} likes`);
    } else if (post.likesCount > 10) {
      reasons.push('Engaging post in your network');
    }

    // Check Islamic content boost
    const hasIslamicTag = (post.hashtags || []).some(tag =>
      FeedTransparencyService.ISLAMIC_TAGS.has(tag.toLowerCase().replace('#', '')),
    );
    if (hasIslamicTag) {
      reasons.push('Islamic content — boosted for the community');
    }

    // Check hashtags
    const hashtagMatches = post.content?.match(/#\w+/g) || [];
    if (hashtagMatches.length > 0 && !hasIslamicTag) {
      reasons.push(`Tagged with ${hashtagMatches.slice(0, 2).join(', ')}`);
    }

    // Recency signal
    const ageHours = (Date.now() - post.createdAt.getTime()) / 3600000;
    if (ageHours < 4) {
      reasons.push('Recently posted');
    }

    // Check user interests
    const interests = await this.prisma.userInterest.findMany({
      where: { userId },
      select: { category: true },
      take: 5,
    });
    if (interests.length > 0) {
      reasons.push('Matches your interests');
    }

    if (reasons.length === 0) reasons.push('Recommended for you');
    return { reasons: reasons.slice(0, 3) };
  }

  async explainThread(userId: string, threadId: string): Promise<ExplainResult> {
    const reasons: string[] = [];
    const thread = await this.prisma.thread.findUnique({
      where: { id: threadId },
      select: {
        userId: true,
        likesCount: true,
        content: true,
        user: { select: { username: true } },
      },
    });
    if (!thread || !thread.userId) return { reasons: ['Thread not found'] };

    const follows = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: thread.userId,
        },
      },
    });
    if (follows) {
      reasons.push(`Posted by @${thread.user?.username ?? 'unknown'}, who you follow`);
    }
    if (thread.likesCount > 50) {
      reasons.push(`Trending thread with ${thread.likesCount} likes`);
    }

    const hashtagMatches = thread.content?.match(/#\w+/g) || [];
    if (hashtagMatches.length > 0) {
      reasons.push(`Tagged with ${hashtagMatches.slice(0, 2).join(', ')}`);
    }

    if (reasons.length === 0) reasons.push('Recommended for you');
    return { reasons: reasons.slice(0, 3) };
  }

  async enhancedSearch(
    query: string,
    cursor?: string,
    limit = 20,
    userId?: string,
  ): Promise<EnhancedSearchResult> {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1);
    if (keywords.length === 0) {
      return { data: [], meta: { cursor: null, hasMore: false } };
    }

    // Use cached utility for block/mute/restrict exclusion
    const excludedUserIds = userId ? await getExcludedUserIds(this.prisma, this.redis, userId) : [];

    const take = limit + 1;
    const posts = await this.prisma.post.findMany({
      where: {
        isRemoved: false,
        visibility: 'PUBLIC',
        AND: [
          { OR: keywords.map((kw) => ({
            content: { contains: kw, mode: 'insensitive' as const },
          })) },
          { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
        ],
        user: {
          isDeactivated: false, isBanned: false, isDeleted: false,
          ...(excludedUserIds.length > 0 ? { id: { notIn: excludedUserIds } } : {}),
        },
      },
      select: ENHANCED_POST_SELECT,
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { likesCount: 'desc' },
    });

    const hasMore = posts.length > limit;
    const sliced = hasMore ? posts.slice(0, limit) : posts;
    const data = sliced.filter((p): p is typeof p & { user: NonNullable<typeof p.user> } => p.user !== null);
    return {
      data,
      meta: {
        cursor: hasMore && data.length > 0 ? data[data.length - 1].id : null,
        hasMore,
      },
    };
  }
}

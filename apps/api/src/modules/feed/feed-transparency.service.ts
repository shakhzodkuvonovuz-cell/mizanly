import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

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
  constructor(private prisma: PrismaService) {}

  async explainPost(userId: string, postId: string): Promise<ExplainResult> {
    const reasons: string[] = [];
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        userId: true,
        likesCount: true,
        commentsCount: true,
        content: true,
        user: { select: { username: true } },
      },
    });
    if (!post) return { reasons: ['Post not found'] };

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
      reasons.push(`Posted by @${post.user.username}, who you follow`);
    }

    // Check engagement
    if (post.likesCount > 100) {
      reasons.push(`Popular post with ${post.likesCount} likes`);
    } else if (post.likesCount > 10) {
      reasons.push('Engaging post in your network');
    }

    // Check hashtags
    const hashtagMatches = post.content?.match(/#\w+/g) || [];
    if (hashtagMatches.length > 0) {
      reasons.push(`Tagged with ${hashtagMatches.slice(0, 2).join(', ')}`);
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
    if (!thread) return { reasons: ['Thread not found'] };

    const follows = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: thread.userId,
        },
      },
    });
    if (follows) {
      reasons.push(`Posted by @${thread.user.username}, who you follow`);
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
      .filter((w) => w.length > 2);
    if (keywords.length === 0) {
      return { data: [], meta: { cursor: null, hasMore: false } };
    }

    // Build exclusion list from blocks and mutes if user is authenticated
    let excludedUserIds: string[] = [];
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
      const blockedIds = new Set<string>();
      for (const b of blocks) {
        if (b.blockerId === userId) blockedIds.add(b.blockedId);
        else blockedIds.add(b.blockerId);
      }
      for (const m of mutes) {
        blockedIds.add(m.mutedId);
      }
      excludedUserIds = Array.from(blockedIds);
    }

    const take = limit + 1;
    const posts = await this.prisma.post.findMany({
      where: {
        isRemoved: false,
        visibility: 'PUBLIC',
        OR: keywords.map((kw) => ({
          content: { contains: kw, mode: 'insensitive' as const },
      take: 50,
    })),
        ...(excludedUserIds.length > 0
          ? { userId: { notIn: excludedUserIds } }
          : {}),
      },
      select: ENHANCED_POST_SELECT,
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { likesCount: 'desc' },
    });

    const hasMore = posts.length > limit;
    const data = hasMore ? posts.slice(0, limit) : posts;
    return {
      data,
      meta: {
        cursor: hasMore && data.length > 0 ? data[data.length - 1].id : null,
        hasMore,
      },
    };
  }
}

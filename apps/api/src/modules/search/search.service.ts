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

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(
    query: string,
    type?: 'people' | 'threads' | 'posts' | 'tags',
    limit = 20,
  ) {
    const results: any = {};

    if (!type || type === 'people') {
      results.people = await this.prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: USER_SEARCH_SELECT,
        take: type ? limit : 5,
        orderBy: { followers: { _count: 'desc' } },
      });
    }

    if (!type || type === 'threads') {
      results.threads = await this.prisma.thread.findMany({
        where: {
          content: { contains: query, mode: 'insensitive' },
          visibility: 'PUBLIC',
          isChainHead: true,
          isRemoved: false,
        },
        select: THREAD_SEARCH_SELECT,
        take: type ? limit : 5,
        orderBy: { likesCount: 'desc' },
      });
    }

    if (!type || type === 'posts') {
      results.posts = await this.prisma.post.findMany({
        where: {
          content: { contains: query, mode: 'insensitive' },
          visibility: 'PUBLIC',
          isRemoved: false,
        },
        select: POST_SEARCH_SELECT,
        take: type ? limit : 5,
        orderBy: { likesCount: 'desc' },
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

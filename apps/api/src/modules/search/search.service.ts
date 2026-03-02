import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(query: string, type?: 'people' | 'threads' | 'posts' | 'tags', limit = 20) {
    const results: any = {};

    if (!type || type === 'people') {
      results.people = await this.prisma.user.findMany({
        where: { OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ]},
        select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, isVerified: true,
          _count: { select: { followers: true } } },
        take: type ? limit : 5,
      });
    }

    if (!type || type === 'threads') {
      results.threads = await this.prisma.thread.findMany({
        where: { content: { contains: query, mode: 'insensitive' }, visibility: 'PUBLIC', replyToId: null },
        include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
        take: type ? limit : 5,
        orderBy: { likeCount: 'desc' },
      });
    }

    if (!type || type === 'posts') {
      results.posts = await this.prisma.post.findMany({
        where: { caption: { contains: query, mode: 'insensitive' }, visibility: 'PUBLIC' },
        include: { author: { select: { id: true, username: true, avatarUrl: true } }, media: { take: 1 } },
        take: type ? limit : 5,
        orderBy: { likeCount: 'desc' },
      });
    }

    if (!type || type === 'tags') {
      results.hashtags = await this.prisma.hashtag.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        take: type ? limit : 10,
        orderBy: { postCount: 'desc' },
      });
    }

    return results;
  }

  async trending() {
    const hashtags = await this.prisma.hashtag.findMany({ take: 20, orderBy: { postCount: 'desc' } });
    const threads = await this.prisma.thread.findMany({
      where: { visibility: 'PUBLIC', replyToId: null, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      take: 10,
      orderBy: { likeCount: 'desc' },
    });
    return { hashtags, threads };
  }

  async suggestedUsers(userId: string) {
    // Get users that your followings follow but you don't
    const myFollowing = await this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } });
    const myFollowingIds = myFollowing.map(f => f.followingId);

    return this.prisma.user.findMany({
      where: { id: { notIn: [...myFollowingIds, userId] }, isPrivate: false },
      select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, isVerified: true,
        _count: { select: { followers: true } } },
      take: 20,
      orderBy: { followers: { _count: 'desc' } },
    });
  }
}

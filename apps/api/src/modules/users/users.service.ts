import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(username: string, currentUserId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true, username: true, displayName: true, bio: true,
        avatarUrl: true, coverPhotoUrl: true, websiteUrl: true,
        isVerified: true, isPrivate: true, createdAt: true,
        _count: { select: { followers: true, following: true, posts: true, threads: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    let isFollowing = false;
    if (currentUserId) {
      const follow = await this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: currentUserId, followingId: user.id } },
      });
      isFollowing = !!follow;
    }

    return { ...user, isFollowing };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
  }

  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) return { error: 'Cannot follow yourself' };
    return this.prisma.follow.create({
      data: { followerId, followingId },
    });
  }

  async unfollow(followerId: string, followingId: string) {
    return this.prisma.follow.delete({
      where: { followerId_followingId: { followerId, followingId } },
    });
  }

  async getFollowers(userId: string, cursor?: string, limit = 20) {
    return this.prisma.follow.findMany({
      where: { followingId: userId },
      include: { follower: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFollowing(userId: string, cursor?: string, limit = 20) {
    return this.prisma.follow.findMany({
      where: { followerId: userId },
      include: { following: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
  }
}

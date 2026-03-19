import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { createClerkClient } from '@clerk/backend';
import { RegisterDto } from './dto/register.dto';
import { SetInterestsDto } from './dto/set-interests.dto';
import { AnalyticsService } from '../../common/services/analytics.service';

@Injectable()
export class AuthService {
  private clerk;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private analytics: AnalyticsService,
  ) {
    this.clerk = createClerkClient({
      secretKey: this.config.get('CLERK_SECRET_KEY'),
    });
  }

  async register(clerkId: string, dto: RegisterDto) {
    // Fetch email from Clerk
    const clerkUser = await this.clerk.users.getUser(clerkId);
    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) throw new BadRequestException('No email address found in Clerk account');

    // Check if username is taken by someone else
    const usernameConflict = await this.prisma.user.findUnique({
      where: { username: dto.username.toLowerCase() },
    });
    if (usernameConflict && usernameConflict.clerkId !== clerkId) {
      throw new ConflictException('Username already taken');
    }

    // Upsert: create on first call, update on subsequent calls
    const user = await this.prisma.user.upsert({
      where: { clerkId },
      create: {
        clerkId,
        email,
        username: dto.username.toLowerCase(),
        displayName: dto.displayName,
        bio: dto.bio ?? '',
        avatarUrl: dto.avatarUrl,
        language: dto.language ?? 'en',
      },
      update: {
        username: dto.username.toLowerCase(),
        displayName: dto.displayName,
        bio: dto.bio,
        avatarUrl: dto.avatarUrl,
        language: dto.language,
      },
    });

    // Ensure UserSettings exists
    await this.prisma.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    // Track user registration
    this.analytics.track('user_registered', user.id, {
      username: user.username,
      language: user.language,
    });
    this.analytics.increment('registrations:daily');

    return user;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        clerkId: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        coverUrl: true,
        website: true,
        location: true,
        followersCount: true,
        followingCount: true,
        postsCount: true,
        role: true,
        isVerified: true,
        isPrivate: true,
        language: true,
        theme: true,
        createdAt: true,
        settings: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async checkUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });
    return { available: !user };
  }

  async setInterests(userId: string, dto: SetInterestsDto) {
    // Delete existing interests then bulk create
    await this.prisma.userInterest.deleteMany({ where: { userId } });
    await this.prisma.userInterest.createMany({
      data: dto.categories.map((category) => ({ userId, category })),
    });
    return { message: 'Interests updated', categories: dto.categories };
  }

  async getSuggestedUsers(userId: string, limit = 5) {
    // People followed by users I follow (friends-of-friends), excluding self & already-followed
    const following = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
      take: 5000, // Cap to prevent unbounded query for users following millions
    });
    const followingIds = following.map((f) => f.followingId);

    const suggestions = await this.prisma.user.findMany({
      where: {
        id: { notIn: [...followingIds, userId] },
        isDeactivated: false,
        isBanned: false,
        followers: { some: { followerId: { in: followingIds } } },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isVerified: true,
        followersCount: true,
      },
      take: limit,
      orderBy: { followersCount: 'desc' },
    });

    // Fallback to popular users if not enough suggestions
    if (suggestions.length < limit) {
      const popular = await this.prisma.user.findMany({
        where: {
          id: {
            notIn: [
              ...followingIds,
              userId,
              ...suggestions.map((s) => s.id),
            ],
          },
          isDeactivated: false,
          isBanned: false,
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isVerified: true,
          followersCount: true,
        },
        take: limit - suggestions.length,
        orderBy: { followersCount: 'desc' },
      });
      suggestions.push(...popular);
    }

    return suggestions;
  }

  // Called by webhook handler
  async syncClerkUser(clerkId: string, data: {
    email: string;
    displayName: string;
    avatarUrl?: string;
  }) {
    return this.prisma.user.upsert({
      where: { clerkId },
      create: {
        clerkId,
        email: data.email,
        username: `user_${clerkId.slice(-8)}`,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
      },
      update: {
        email: data.email,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
      },
    });
  }

  async deactivateByClerkId(clerkId: string) {
    return this.prisma.user.updateMany({
      where: { clerkId },
      data: { isDeactivated: true, deactivatedAt: new Date() },
    });
  }
}

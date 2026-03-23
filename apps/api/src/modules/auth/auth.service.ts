import {
  Injectable,
  Inject,
  ConflictException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { createClerkClient } from '@clerk/backend';
import { RegisterDto } from './dto/register.dto';
import { SetInterestsDto } from './dto/set-interests.dto';
import { AnalyticsService } from '../../common/services/analytics.service';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';

/** Minimum age required to register (COPPA compliance) */
const MINIMUM_AGE = 13;
/** Age at which parental consent is no longer required (GDPR Art 8) */
const PARENTAL_CONSENT_AGE = 18;

@Injectable()
export class AuthService {
  private clerk;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private analytics: AnalyticsService,
    @Inject('REDIS') private redis: Redis,
  ) {
    this.clerk = createClerkClient({
      secretKey: this.config.get('CLERK_SECRET_KEY'),
    });
  }

  /**
   * Calculate age from date of birth string.
   * COPPA/GDPR compliance: must be 13+ to register.
   */
  private calculateAge(dateOfBirth: string): number {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  async register(clerkId: string, dto: RegisterDto) {
    // Rate-limit registration attempts per Clerk ID (brute-force prevention)
    const attemptKey = `register_attempts:${clerkId}`;
    const attempts = await this.redis.incr(attemptKey);
    if (attempts === 1) await this.redis.expire(attemptKey, 900); // 15 min window
    if (attempts > 5) {
      throw new ForbiddenException('Too many registration attempts. Try again in 15 minutes.');
    }

    // COPPA/GDPR Age Verification (Finding 1, 15)
    const age = this.calculateAge(dto.dateOfBirth);
    if (age < MINIMUM_AGE) {
      throw new ForbiddenException(
        `You must be at least ${MINIMUM_AGE} years old to use Mizanly. COPPA and GDPR require age verification.`,
      );
    }

    // Terms of Service acceptance (Finding 4, 21 — GDPR Art 7)
    if (!dto.acceptedTerms) {
      throw new BadRequestException(
        'You must accept the Terms of Service and Privacy Policy to create an account',
      );
    }

    // Fetch email from Clerk
    let clerkUser;
    try {
      clerkUser = await this.clerk.users.getUser(clerkId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to verify account: ${msg}`);
    }
    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) throw new BadRequestException('No email address found in Clerk account');

    // Check if username is taken by someone else
    const usernameConflict = await this.prisma.user.findUnique({
      where: { username: dto.username.toLowerCase() },
    });
    if (usernameConflict && usernameConflict.clerkId !== clerkId) {
      throw new ConflictException('Username already taken');
    }

    const isMinor = age < PARENTAL_CONSENT_AGE;

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
        // Mark as child account if under 18 — triggers restrictive defaults (Finding 15, 30)
        isChildAccount: isMinor,
        // TODO: [LEGAL] Add tosAcceptedAt, tosVersion, privacyPolicyAcceptedAt, dateOfBirth
        // fields to User model (requires schema migration). Currently storing acceptance
        // via the DTO validation + isChildAccount flag. Schema fields needed for:
        // - Demonstrable consent record (GDPR Art 7)
        // - ToS version tracking for re-acceptance on update
        // - Age-based feature gating queries
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

    if (isMinor) {
      this.logger.log(`Minor registered (age ${age}): user ${user.id} — child protections active`);
    }

    // Clear attempt counter on successful registration
    await this.redis.del(attemptKey);

    // Track user registration
    this.analytics.track('user_registered', user.id, {
      username: user.username,
      language: user.language,
      isMinor,
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

    // Finding F16: Check if user has 2FA enabled so mobile app can show verification screen.
    // Clerk handles primary authentication, but app-level TOTP needs a post-login check.
    const twoFactorRecord = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
      select: { isEnabled: true },
    });

    return {
      ...user,
      twoFactorEnabled: twoFactorRecord?.isEnabled ?? false,
    };
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
      take: 1000, // Cap to prevent unbounded query for users following millions
    });
    const followingIds = following.map((f) => f.followingId);

    const suggestions = await this.prisma.user.findMany({
      where: {
        id: { notIn: [...followingIds, userId] },
        isDeactivated: false,
        isBanned: false,
        isDeleted: false,
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
          isDeleted: false,
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

  // TODO: [ARCH/F19] Missing Clerk webhook events:
  // - user.updated → sync profile changes (email, phone, avatar)
  // - session.created → track login events, enforce 2FA
  // - session.revoked → clean up active sessions
  // - organization.* → community/circle sync
  // Currently only user.created and user.deleted are handled.
  // Requires CLERK_WEBHOOK_SECRET to be set (currently empty).

  // Called by webhook handler
  async syncClerkUser(clerkId: string, data: {
    email: string;
    displayName: string;
    avatarUrl?: string;
  }) {
    // Check if this clerkId already exists (update case) — keep existing username
    const existingByClerk = await this.prisma.user.findUnique({ where: { clerkId } });
    if (existingByClerk) {
      return this.prisma.user.update({
        where: { clerkId },
        data: {
          email: data.email,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
        },
      });
    }

    // New user — generate cryptographically random username (not derived from clerkId)
    const randomSuffix = randomBytes(4).toString('hex');
    const baseUsername = `user_${randomSuffix}`;
    let username = baseUsername;

    // Check for username collision and add another random suffix if needed
    const usernameConflict = await this.prisma.user.findUnique({ where: { username } });
    if (usernameConflict) {
      username = `user_${randomBytes(4).toString('hex')}`;
    }

    return this.prisma.user.create({
      data: {
        clerkId,
        email: data.email,
        username,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
      },
    });
  }

  async deactivateByClerkId(clerkId: string) {
    // Find the user first to clean up related data
    const user = await this.prisma.user.findFirst({ where: { clerkId } });
    if (!user) return { count: 0 };

    // Deactivate the user
    await this.prisma.user.update({
      where: { id: user.id },
      data: { isDeactivated: true, deactivatedAt: new Date() },
    });

    // Clean up device tokens so no notifications are sent to deactivated user
    await this.prisma.device.deleteMany({ where: { userId: user.id } });

    return { count: 1 };
  }
}

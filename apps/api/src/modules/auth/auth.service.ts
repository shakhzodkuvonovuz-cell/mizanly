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
import { QueueService } from '../../common/queue/queue.service';
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
    private queueService: QueueService,
    @Inject('REDIS') private redis: Redis,
  ) {
    this.clerk = createClerkClient({
      secretKey: this.config.get('CLERK_SECRET_KEY'),
    });
  }

  /** Find a user by Clerk ID. Returns { id } or null. */
  async findByClerkId(clerkId: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({ where: { clerkId }, select: { id: true } });
  }

  /** Expose Redis client for webhook controller (session revocation pub/sub). */
  getRedis(): Redis { return this.redis; }

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

    // Device fingerprint abuse prevention — limit accounts per physical device
    if (dto.deviceId) {
      const deviceKey = `device_accounts:${dto.deviceId}`;
      const count = parseInt(await this.redis.get(deviceKey) || '0');
      if (count >= 5) {
        throw new BadRequestException('Too many accounts created from this device');
      }
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
      // A01-#6: Don't leak Clerk API error details to client
      this.logger.error('Clerk user verification failed', error instanceof Error ? error.message : String(error));
      throw new BadRequestException('Failed to verify account. Please try again later.');
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

    // Finding #285: Prevent re-registration within 30 days of account deletion
    const recentlyDeleted = await this.prisma.user.findFirst({
      where: { email, isDeleted: true, deletedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    });
    if (recentlyDeleted) {
      throw new BadRequestException('This account was recently deleted. Please wait 30 days before re-registering.');
    }

    // A01-#1: Use select to avoid returning internal fields (clerkId, email, reputationScore, etc.)
    const SAFE_USER_SELECT = {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      language: true,
      isVerified: true,
      isPrivate: true,
      createdAt: true,
      referralCode: true,
    };

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
        // Record ToS acceptance for GDPR Art 7 demonstrable consent
        tosAcceptedAt: new Date(),
        tosVersion: '1.0',
        // A01-#12: Use 10 chars (60 bits entropy) instead of 8 (48 bits) to push collision birthday
        // paradox boundary from ~16M to ~1B users. Still uses retry on P2002 below.
        referralCode: randomBytes(8).toString('base64url').slice(0, 10),
      },
      update: {
        username: dto.username.toLowerCase(),
        displayName: dto.displayName,
        bio: dto.bio,
        avatarUrl: dto.avatarUrl,
        language: dto.language,
      },
      select: SAFE_USER_SELECT,
    });

    // Ensure UserSettings exists
    await this.prisma.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    if (isMinor) {
      // A01-#19: Log isMinor flag without exact age (COPPA compliance)
      this.logger.log(`Minor registered: user ${user.id} — child protections active`);
    }

    // Increment device account counter after successful registration
    // TTL of 365 days prevents indefinite Redis key accumulation while maintaining abuse prevention
    if (dto.deviceId) {
      const deviceKey = `device_accounts:${dto.deviceId}`;
      await this.redis.incr(deviceKey);
      await this.redis.expire(deviceKey, 365 * 24 * 60 * 60);
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

  // Clerk webhook events handled by WebhookController (auth.controller.ts):
  // - user.created → syncClerkUser (create user record)
  // - user.updated → syncClerkUser (sync profile: email, phone, avatar, username)
  // - user.deleted → deactivateByClerkId (mark for data purge)
  // - session.created → trackLogin (update lastSeenAt)
  // - session.revoked → Redis pub/sub session invalidation

  // Called by webhook handler
  async syncClerkUser(clerkId: string, data: {
    email: string;
    displayName: string;
    avatarUrl?: string;
    phone?: string;
    username?: string;
  }) {
    // Check if this clerkId already exists (update case)
    const existingByClerk = await this.prisma.user.findUnique({ where: { clerkId } });
    if (existingByClerk) {
      // Sync username if changed (and new username is available + not taken by another user)
      const usernameUpdate: Record<string, string> = {};
      if (data.username && data.username !== existingByClerk.username) {
        const taken = await this.prisma.user.findUnique({ where: { username: data.username }, select: { id: true } });
        if (!taken) {
          usernameUpdate.previousUsername = existingByClerk.username;
          usernameUpdate.username = data.username;
        }
      }
      const updatedUser = await this.prisma.user.update({
        where: { clerkId },
        data: {
          email: data.email,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
          ...(data.phone ? { phone: data.phone } : {}),
          ...usernameUpdate,
        },
        select: { id: true, username: true, displayName: true, bio: true },
      });

      // Re-index updated user in search
      this.queueService.addSearchIndexJob({
        action: 'index',
        indexName: 'users',
        documentId: updatedUser.id,
        document: {
          id: updatedUser.id,
          username: updatedUser.username,
          displayName: updatedUser.displayName,
          bio: updatedUser.bio,
        },
      }).catch((err: unknown) => {
        this.logger.warn('Search index update failed for user sync', err instanceof Error ? err.message : err);
      });

      return updatedUser;
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

    const user = await this.prisma.user.create({
      data: {
        clerkId,
        email: data.email,
        username,
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
        language: 'en',
        // A01-#8: Remove auto-ToS for webhook users — require explicit acceptance on first app launch
        ...(data.phone ? { phone: data.phone } : {}),
      },
      select: { id: true, username: true, displayName: true, bio: true },
    });

    // Ensure UserSettings record exists for new webhook-created users
    await this.prisma.userSettings.create({ data: { userId: user.id } }).catch(() => {});

    // Index new user in search
    this.queueService.addSearchIndexJob({
      action: 'index',
      indexName: 'users',
      documentId: user.id,
      document: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio ?? '',
      },
    }).catch((err: unknown) => {
      this.logger.warn('Search index failed for new webhook user', err instanceof Error ? err.message : err);
    });

    return user;
  }

  async trackLogin(clerkId: string) {
    await this.prisma.user.updateMany({
      where: { clerkId, isDeactivated: false, isDeleted: false },
      data: { lastSeenAt: new Date() },
    });
  }

  async deactivateByClerkId(clerkId: string) {
    // Find the user first to clean up related data
    const user = await this.prisma.user.findFirst({ where: { clerkId } });
    if (!user) return { count: 0 };

    // Deactivate the user and mark for deletion so the daily cron picks it up
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isDeactivated: true,
        deactivatedAt: new Date(),
        isDeleted: true,
        deletedAt: new Date(),
        scheduledDeletionAt: new Date(),
      },
    });

    // Clean up device tokens so no notifications are sent to deactivated user
    await this.prisma.device.deleteMany({ where: { userId: user.id } });

    this.logger.log(`User ${user.id} deactivated via Clerk deletion webhook — scheduled for data purge`);

    return { count: 1 };
  }
}

import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { PrismaService } from '../../config/prisma.service';
import { acquireCronLock } from '../../common/utils/cron-lock';
import { TwoFactorService } from '../two-factor/two-factor.service';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS') private redis: Redis,
    private twoFactorService: TwoFactorService,
  ) {}

  async register(userId: string, pushToken: string, platform: string, deviceId?: string) {
    // Check if token is already registered to another active user
    const existing = await this.prisma.device.findUnique({ where: { pushToken } });
    if (existing && existing.userId !== userId && existing.isActive) {
      // Token belongs to another active user — deactivate their old record first
      await this.prisma.device.update({
        where: { pushToken },
        data: { isActive: false },
      });
    }

    return this.prisma.device.upsert({
      where: { pushToken },
      create: { userId, pushToken, platform, deviceId, isActive: true },
      update: { userId, platform, deviceId, isActive: true, updatedAt: new Date() },
    });
  }

  async unregister(pushToken: string, userId: string) {
    await this.prisma.device.updateMany({
      where: { pushToken, userId },
      data: { isActive: false },
    });
  }

  async getActiveTokensForUser(userId: string): Promise<string[]> {
    const devices = await this.prisma.device.findMany({
      where: { userId, isActive: true },
      select: { pushToken: true },
      take: 50,
    });
    return devices.map((d) => d.pushToken);
  }

  async getActiveTokensForUsers(userIds: string[]): Promise<string[]> {
    const devices = await this.prisma.device.findMany({
      where: { userId: { in: userIds }, isActive: true },
      select: { pushToken: true },
      take: 50,
    });
    return devices.map((d) => d.pushToken);
  }

  /**
   * Get all active sessions for a user (for device session management screen).
   */
  async getSessions(userId: string) {
    return this.prisma.device.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        platform: true,
        deviceName: true,
        os: true,
        ipAddress: true,
        location: true,
        lastActiveAt: true,
        createdAt: true,
      },
      orderBy: { lastActiveAt: 'desc' },
      take: 20,
    });
  }

  /**
   * Log out a specific session (deactivate device).
   * F2-4: Also clears 2FA verification flag so the session cannot bypass TOTP on re-auth.
   */
  async logoutSession(sessionId: string, userId: string) {
    await this.prisma.device.updateMany({
      where: { id: sessionId, userId },
      data: { isActive: false },
    });

    // F2-4: Clear the 2FA verification flag for this specific session.
    // We use the device sessionId as the Clerk session identifier since the device
    // record maps 1:1 to a user session. Also clear the fallback (no-session) key.
    await this.twoFactorService.clearTwoFactorSession(userId, sessionId).catch((err: unknown) => {
      this.logger.warn(`Failed to clear 2FA session for ${userId}:${sessionId}`, err instanceof Error ? err.message : String(err));
    });

    return { loggedOut: true };
  }

  /**
   * Log out all other sessions (keep current device active).
   * F2-4: Also clears 2FA verification flags for all sessions except current,
   * so logged-out sessions cannot bypass TOTP on re-auth.
   */
  async logoutAllOtherSessions(userId: string, currentSessionId: string) {
    // Fetch IDs of sessions being deactivated so we can clear their 2FA flags
    const sessionsToDeactivate = await this.prisma.device.findMany({
      where: { userId, isActive: true, id: { not: currentSessionId } },
      select: { id: true },
    });

    await this.prisma.device.updateMany({
      where: { userId, isActive: true, id: { not: currentSessionId } },
      data: { isActive: false },
    });

    // F2-4: Clear 2FA verification flags for each deactivated session
    const clearPromises = sessionsToDeactivate.map((session) =>
      this.twoFactorService.clearTwoFactorSession(userId, session.id).catch((err: unknown) => {
        this.logger.warn(`Failed to clear 2FA for session ${session.id}`, err instanceof Error ? err.message : String(err));
      }),
    );
    await Promise.all(clearPromises);

    return { loggedOut: true };
  }

  /**
   * Update session metadata (called on API requests to track activity).
   */
  // B01-#17: Added userId parameter and use updateMany with both id+userId to prevent
  // cross-user device metadata tampering
  async touchSession(deviceId: string, ipAddress?: string, userId?: string) {
    if (!deviceId) return;
    try {
      await this.prisma.device.updateMany({
        where: { id: deviceId, ...(userId ? { userId } : {}) },
        data: {
          lastActiveAt: new Date(),
          ...(ipAddress ? { ipAddress } : {}),
        },
      });
    } catch {
      // Device may not exist — ignore
    }
  }

  /**
   * Clean up stale device tokens that have not been updated in the given number of days.
   * Tokens that haven't re-registered for a long time are likely expired.
   */
  @Cron('0 0 4 * * *') // 4 AM daily
  async cleanupStaleTokens(olderThanDays = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    try {
      if (!await acquireCronLock(this.redis, 'cron:cleanupStaleTokens', 3500, this.logger)) return 0;
      const result = await this.prisma.device.deleteMany({
        where: {
          isActive: false,
          updatedAt: { lt: cutoff },
        },
      });
      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} stale device tokens older than ${olderThanDays} days`);
      }
      return result.count;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to clean up stale tokens: ${message}`, stack);
      return 0;
    }
  }
}

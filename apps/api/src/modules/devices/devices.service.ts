import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private prisma: PrismaService) {}

  async register(userId: string, pushToken: string, platform: string, deviceId?: string) {
    // If the token was previously deactivated, re-activate it for the current user
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
    });
    return devices.map((d) => d.pushToken);
  }

  async getActiveTokensForUsers(userIds: string[]): Promise<string[]> {
    const devices = await this.prisma.device.findMany({
      where: { userId: { in: userIds }, isActive: true },
      select: { pushToken: true },
    });
    return devices.map((d) => d.pushToken);
  }

  /**
   * Clean up stale device tokens that have not been updated in the given number of days.
   * Tokens that haven't re-registered for a long time are likely expired.
   */
  async cleanupStaleTokens(olderThanDays = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    try {
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
    } catch (error) {
      this.logger.error(`Failed to clean up stale tokens: ${error.message}`, error.stack);
      return 0;
    }
  }
}

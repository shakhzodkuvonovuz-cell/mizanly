import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

  async register(userId: string, pushToken: string, platform: string, deviceId?: string) {
    return this.prisma.device.upsert({
      where: { pushToken },
      create: { userId, pushToken, platform, deviceId, isActive: true },
      update: { userId, platform, deviceId, isActive: true },
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
}

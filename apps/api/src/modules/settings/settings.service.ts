import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { AutoPlaySetting, Prisma } from '@prisma/client';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { UpdateNotificationsDto } from './dto/update-notifications.dto';
import { UpdateAccessibilityDto } from './dto/update-accessibility.dto';
import { UpdateWellbeingDto } from './dto/update-wellbeing.dto';
import { UpdateQuietModeDto } from './dto/quiet-mode.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getSettings(userId: string) {
    // Auto-create if first call
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return settings;
  }

  async updatePrivacy(userId: string, dto: UpdatePrivacyDto) {
    const { isPrivate, ...settingsFields } = dto;

    // Update UserSettings for settings fields
    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...settingsFields } as Prisma.UserSettingsUncheckedCreateInput,
      update: settingsFields as Prisma.UserSettingsUncheckedUpdateInput,
    });

    // Update User.isPrivate if provided
    if (isPrivate !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isPrivate },
      });
    }

    return settings;
  }

  async updateNotifications(userId: string, dto: UpdateNotificationsDto) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }

  async updateAccessibility(userId: string, dto: UpdateAccessibilityDto) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }

  async updateWellbeing(userId: string, dto: UpdateWellbeingDto) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }

  async getBlockedKeywords(userId: string) {
    return this.prisma.blockedKeyword.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async addBlockedKeyword(userId: string, keyword: string) {
    return this.prisma.blockedKeyword.upsert({
      where: { userId_keyword: { userId, keyword: keyword.toLowerCase() } },
      create: { userId, keyword: keyword.toLowerCase() },
      update: {},
    });
  }

  async removeBlockedKeyword(userId: string, id: string) {
    const kw = await this.prisma.blockedKeyword.findUnique({ where: { id } });
    if (!kw || kw.userId !== userId) throw new NotFoundException('Keyword not found');
    await this.prisma.blockedKeyword.delete({ where: { id } });
    return { message: 'Keyword removed' };
  }

  async getQuietMode(userId: string) {
    const setting = await this.prisma.quietModeSetting.findUnique({ where: { userId } });
    if (!setting) {
      return { isActive: false, autoReply: null, startTime: null, endTime: null, isScheduled: false };
    }
    return setting;
  }

  async updateQuietMode(userId: string, dto: UpdateQuietModeDto) {
    return this.prisma.quietModeSetting.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }

  async logScreenTime(userId: string, seconds: number) {
    if (seconds <= 0 || seconds > 86400) {
      throw new BadRequestException('Seconds must be between 1 and 86,400 (24 hours)');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.screenTimeLog.upsert({
      where: { userId_date: { userId, date: today } },
      create: { userId, date: today, totalSeconds: seconds, sessions: 1 },
      update: { totalSeconds: { increment: seconds }, sessions: { increment: 1 } },
    });
  }

  async getScreenTimeStats(userId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const logs = await this.prisma.screenTimeLog.findMany({
      where: { userId, date: { gte: sevenDaysAgo } },
      orderBy: { date: 'asc' },
      take: 50,
    });

    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { screenTimeLimitMinutes: true },
    });

    const totalSeconds = logs.reduce((sum, l) => sum + l.totalSeconds, 0);
    const totalSessions = logs.reduce((sum, l) => sum + l.sessions, 0);
    const avgDailySeconds = logs.length > 0 ? Math.round(totalSeconds / logs.length) : 0;

    return {
      daily: logs.map(l => ({
        date: l.date.toISOString().split('T')[0],
        totalSeconds: l.totalSeconds,
        sessions: l.sessions,
      })),
      totalSeconds,
      totalSessions,
      avgDailySeconds,
      limitMinutes: settings?.screenTimeLimitMinutes ?? null,
    };
  }

  async setScreenTimeLimit(userId: string, limitMinutes: number | null) {
    if (limitMinutes !== null && (limitMinutes <= 0 || limitMinutes > 1440)) {
      throw new BadRequestException('Limit must be between 1 and 1,440 minutes (24 hours)');
    }
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, screenTimeLimitMinutes: limitMinutes },
      update: { screenTimeLimitMinutes: limitMinutes },
    });
  }

  async isQuietModeActive(userId: string): Promise<boolean> {
    const setting = await this.prisma.quietModeSetting.findUnique({ where: { userId } });
    if (!setting) return false;
    if (setting.isActive) return true;
    if (setting.isScheduled && setting.startTime && setting.endTime) {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (setting.startTime <= setting.endTime) {
        return currentTime >= setting.startTime && currentTime <= setting.endTime;
      }
      // Overnight schedule (e.g., 22:00 - 07:00)
      return currentTime >= setting.startTime || currentTime <= setting.endTime;
    }
    return false;
  }

  async getAutoPlaySetting(userId: string) {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { autoPlaySetting: true },
    });
    return { autoPlaySetting: settings?.autoPlaySetting ?? 'WIFI' };
  }

  async updateAutoPlaySetting(userId: string, autoPlaySetting: string) {
    const valid = ['WIFI', 'ALWAYS', 'NEVER'];
    if (!valid.includes(autoPlaySetting)) {
      throw new BadRequestException('Invalid auto-play setting. Must be: WIFI, ALWAYS, or NEVER');
    }
    return this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, autoPlaySetting: autoPlaySetting as AutoPlaySetting },
      update: { autoPlaySetting: autoPlaySetting as AutoPlaySetting },
    });
  }
}

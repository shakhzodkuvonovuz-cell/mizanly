import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { UpdateNotificationsDto } from './dto/update-notifications.dto';
import { UpdateAccessibilityDto } from './dto/update-accessibility.dto';
import { UpdateWellbeingDto } from './dto/update-wellbeing.dto';

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
      create: { userId, ...settingsFields },
      update: settingsFields,
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
}

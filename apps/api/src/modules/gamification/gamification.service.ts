import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { StreakType, ChallengeType, ChallengeCategory, SeriesCategory, ProfileLayout, ProfileBioFont } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

// XP rewards for different actions
const XP_REWARDS: Record<string, number> = {
  post_created: 10,
  thread_created: 15,
  reel_created: 20,
  video_created: 25,
  comment_posted: 5,
  comment_helpful: 10,
  quran_read: 20,
  dhikr_completed: 10,
  challenge_completed: 50,
  streak_milestone_7: 25,
  streak_milestone_30: 100,
  streak_milestone_100: 500,
  first_follower: 15,
  verified: 200,
};

// Level thresholds (50 levels)
const LEVEL_THRESHOLDS = [
  0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500,
  7500, 10000, 13000, 17000, 22000, 28000, 35000, 43000, 52000, 65000,
  80000, 100000, 125000, 155000, 190000, 230000, 275000, 325000, 380000, 440000,
  510000, 590000, 680000, 780000, 890000, 1010000, 1150000, 1300000, 1470000, 1660000,
  1870000, 2100000, 2360000, 2650000, 2970000, 3330000, 3730000, 4180000, 4680000, 5240000,
];

function getLevelForXP(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

function getXPForNextLevel(level: number): number {
  return LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + 10000;
}

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);
  constructor(
    private prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Streaks ─────────────────────────────────────────────

  async getStreaks(userId: string) {
    return this.prisma.userStreak.findMany({
      where: { userId },
      orderBy: { currentDays: 'desc' },
      take: 50,
    });
  }

  async updateStreak(userId: string, streakType: string | StreakType) {
    // Use UTC date string for timezone-safe comparison
    const todayStr = new Date().toISOString().slice(0, 10);
    const today = new Date(todayStr + 'T00:00:00.000Z');

    const streak = await this.prisma.userStreak.findUnique({
      where: { userId_streakType: { userId, streakType: streakType as StreakType } },
    });

    if (!streak) {
      return this.prisma.userStreak.create({
        data: { userId, streakType: streakType as StreakType, currentDays: 1, longestDays: 1, lastActiveDate: today },
      });
    }

    // Normalize to UTC date strings for reliable comparison
    const lastActiveStr = streak.lastActiveDate.toISOString().slice(0, 10);
    if (lastActiveStr === todayStr) return streak; // Already counted today

    const lastActiveDate = new Date(lastActiveStr + 'T00:00:00.000Z');
    const diffMs = today.getTime() - lastActiveDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Continue streak — atomic increment + conditional longestDays update in a transaction
      // to ensure the read-after-write sees the updated data
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE user_streaks
          SET "currentDays" = "currentDays" + 1,
              "lastActiveDate" = ${today},
              "longestDays" = GREATEST("longestDays", "currentDays" + 1)
          WHERE "userId" = ${userId} AND "streakType" = ${streakType}
        `;
        return tx.userStreak.findUnique({
          where: { userId_streakType: { userId, streakType: streakType as StreakType } },
        });
      });
      if (!updated) return streak;

      // Award XP for milestone streaks (async, non-blocking)
      if (updated.currentDays === 7) this.awardXP(userId, 'streak_milestone_7').catch((e) => this.logger.error('Streak XP award failed', e));
      if (updated.currentDays === 30) this.awardXP(userId, 'streak_milestone_30').catch((e) => this.logger.error('Streak XP award failed', e));
      if (updated.currentDays === 100) this.awardXP(userId, 'streak_milestone_100').catch((e) => this.logger.error('Streak XP award failed', e));

      return updated;
    }

    // Streak broken — reset
    return this.prisma.userStreak.update({
      where: { userId_streakType: { userId, streakType: streakType as StreakType } },
      data: { currentDays: 1, lastActiveDate: today },
    });
  }

  // ── XP & Levels ─────────────────────────────────────────

  async getXP(userId: string) {
    const xp = await this.prisma.userXP.findUnique({ where: { userId } });
    if (!xp) {
      return this.prisma.userXP.create({ data: { userId, totalXP: 0, level: 1 } });
    }
    const nextLevelXP = getXPForNextLevel(xp.level);
    const currentLevelXP = LEVEL_THRESHOLDS[xp.level - 1] || 0;
    const denominator = nextLevelXP - currentLevelXP;
    return {
      ...xp,
      nextLevelXP,
      currentLevelXP,
      progressToNext: denominator > 0 ? (xp.totalXP - currentLevelXP) / denominator : 1.0,
    };
  }

  async awardXP(userId: string, reason: string, customAmount?: number) {
    const amount = customAmount ?? XP_REWARDS[reason] ?? 5;
    if (amount <= 0) return this.getXP(userId); // Reject non-positive amounts

    // Wrap in transaction: increment + re-read totalXP + level calc + history
    // Reading totalXP INSIDE the transaction (after increment) ensures level
    // is calculated from the correct value, not a stale pre-increment read.
    return this.prisma.$transaction(async (tx) => {
      const xp = await tx.userXP.upsert({
        where: { userId },
        create: { userId, totalXP: amount, level: getLevelForXP(amount) },
        update: { totalXP: { increment: amount } },
      });

      // Re-read to get the actual totalXP after increment (upsert returns post-increment value)
      const newLevel = getLevelForXP(xp.totalXP);
      if (newLevel !== xp.level) {
        await tx.$executeRaw`
          UPDATE "UserXP" SET "level" = ${newLevel}
          WHERE "userId" = ${userId} AND "level" < ${newLevel}
        `;
      }

      await tx.xPHistory.create({
        data: { userXPId: xp.id, amount, reason },
      });

      return { ...xp, level: newLevel };
    });
  }

  async getXPHistory(userId: string, cursor?: string, limit = 20) {
    const xp = await this.prisma.userXP.findUnique({ where: { userId } });
    if (!xp) return { data: [], meta: { cursor: null, hasMore: false } };

    const where: Record<string, unknown> = { userXPId: xp.id };
    if (cursor) where.createdAt = { lt: new Date(cursor) };

    const history = await this.prisma.xPHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = history.length > limit;
    if (hasMore) history.pop();

    return {
      data: history,
      meta: { cursor: history[history.length - 1]?.createdAt?.toISOString() || null, hasMore },
    };
  }

  // ── Achievements ────────────────────────────────────────

  async getAchievements(userId: string) {
    const all = await this.prisma.achievement.findMany({ orderBy: { category: 'asc' },
      take: 50,
    });
    const unlocked = await this.prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true, unlockedAt: true },
      take: 50,
    });
    const unlockedMap = new Map(unlocked.map(u => [u.achievementId, u.unlockedAt]));

    return all.map(a => ({
      ...a,
      unlocked: unlockedMap.has(a.id),
      unlockedAt: unlockedMap.get(a.id) || null,
    }));
  }

  async unlockAchievement(userId: string, achievementKey: string) {
    const achievement = await this.prisma.achievement.findUnique({ where: { key: achievementKey } });
    if (!achievement) return null;

    try {
      await this.prisma.userAchievement.create({
        data: { userId, achievementId: achievement.id },
      });
    } catch (err: unknown) {
      // Handle duplicate unlock (race condition or retry)
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        return null; // Already unlocked
      }
      throw err;
    }

    if (achievement.xpReward > 0) {
      await this.awardXP(userId, 'achievement_unlocked', achievement.xpReward);
    }

    return achievement;
  }

  // ── Leaderboards ────────────────────────────────────────

  async getLeaderboard(type: string, limit = 50) {
    const safeLim = Math.min(Math.max(1, limit), 100);
    if (type === 'xp') {
      return this.prisma.userXP.findMany({
        orderBy: { totalXP: 'desc' },
        take: safeLim,
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        },
      });
    }

    if (type === 'streaks') {
      return this.prisma.userStreak.findMany({
        where: { streakType: 'POSTING' },
        orderBy: { currentDays: 'desc' },
        take: safeLim,
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        },
      });
    }

    if (type === 'helpers') {
      // Top commenters (helpful contributions)
      const topCommenters = await this.prisma.comment.groupBy({
        by: ['userId'],
        _sum: { likesCount: true },
        orderBy: { _sum: { likesCount: 'desc' } },
        take: safeLim,
      });

      const userIds = topCommenters.map(c => c.userId);
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
      take: 50,
    });
      const userMap = new Map(users.map(u => [u.id, u]));

      return topCommenters
        .map(c => ({
          user: userMap.get(c.userId),
          score: c._sum.likesCount || 0,
        }))
        .filter(c => c.user); // Filter out deleted users
    }

    return [];
  }

  // ── Challenges ──────────────────────────────────────────

  async getChallenges(cursor?: string, limit = 20, category?: string) {
    const where: Record<string, unknown> = { isActive: true, endDate: { gte: new Date() } };
    if (category) where.category = category;
    if (cursor) where.id = { lt: cursor };

    const challenges = await this.prisma.challenge.findMany({
      where,
      orderBy: { participantCount: 'desc' },
      take: limit + 1,
      include: {
        creator: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    const hasMore = challenges.length > limit;
    if (hasMore) challenges.pop();

    return {
      data: challenges,
      meta: { cursor: challenges[challenges.length - 1]?.id || null, hasMore },
    };
  }

  async createChallenge(userId: string, dto: {
    title: string; description: string; coverUrl?: string;
    challengeType: string; category: string; targetCount: number;
    xpReward?: number; startDate: string; endDate: string;
  }) {
    if (dto.xpReward && dto.xpReward > 500) {
      throw new BadRequestException('XP reward cannot exceed 500');
    }
    return this.prisma.challenge.create({
      data: {
        ...dto,
        challengeType: dto.challengeType as ChallengeType,
        category: dto.category as ChallengeCategory,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        xpReward: dto.xpReward || 100,
        createdById: userId,
      },
    });
  }

  async joinChallenge(userId: string, challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) throw new NotFoundException('Challenge not found');
    if (!challenge.isActive || challenge.endDate < new Date()) {
      throw new BadRequestException('Challenge has ended');
    }

    try {
      await this.prisma.$transaction([
        this.prisma.challengeParticipant.create({
          data: { challengeId, userId },
        }),
        this.prisma.challenge.update({
          where: { id: challengeId },
          data: { participantCount: { increment: 1 } },
        }),
      ]);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        throw new ConflictException('Already joined');
      }
      throw err;
    }

    // Notify challenge creator that someone joined
    if (challenge.createdById !== userId) {
      this.notificationsService.create({
        userId: challenge.createdById,
        actorId: userId,
        type: 'SYSTEM',
        title: 'New challenger',
        body: `Someone joined your challenge "${challenge.title}"`,
      }).catch(err => this.logger.warn('Challenge join notification failed', err.message));
    }

    return { success: true };
  }

  async updateChallengeProgress(userId: string, challengeId: string, progress: number) {
    const participant = await this.prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId, userId } },
      include: { challenge: true },
    });
    if (!participant) throw new NotFoundException('Not participating');

    if (participant.completed) {
      throw new BadRequestException('Challenge already completed');
    }

    if (participant.challenge.endDate < new Date()) {
      throw new BadRequestException('Challenge has ended');
    }

    // Server-side validation: treat progress as an increment, not an absolute value.
    // Max increment per request is 1 to prevent arbitrary progress jumps.
    const MAX_INCREMENT = 1;
    if (progress < 0) {
      throw new BadRequestException('Progress cannot be negative');
    }
    if (progress > MAX_INCREMENT) {
      throw new BadRequestException(`Progress increment cannot exceed ${MAX_INCREMENT} per request`);
    }

    const newProgress = Math.min(participant.progress + progress, participant.challenge.targetCount);
    const completed = newProgress >= participant.challenge.targetCount;

    const updated = await this.prisma.challengeParticipant.update({
      where: { challengeId_userId: { challengeId, userId } },
      data: {
        progress: newProgress,
        completed,
        completedAt: completed ? new Date() : participant.completedAt,
      },
    });

    // Award XP on completion and notify challenge creator
    if (completed) {
      await this.awardXP(userId, 'challenge_completed', participant.challenge.xpReward);

      // Notify the challenge creator that someone completed their challenge
      if (participant.challenge.createdById !== userId) {
        this.notificationsService.create({
          userId: participant.challenge.createdById,
          actorId: userId,
          type: 'SYSTEM',
          title: 'Challenge completed',
          body: `Someone completed your challenge "${participant.challenge.title}"`,
        }).catch(err => this.logger.warn('Challenge completion notification failed', err.message));
      }
    }

    return updated;
  }

  async getMyChallenges(userId: string) {
    return this.prisma.challengeParticipant.findMany({
      where: { userId },
      orderBy: { joinedAt: 'desc' },
      include: {
        challenge: {
          include: {
            creator: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
      },
      take: 50,
    });
  }

  async leaveChallenge(userId: string, challengeId: string) {
    const participant = await this.prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId, userId } },
    });
    if (!participant) throw new NotFoundException('Not participating in this challenge');
    if (participant.completed) throw new BadRequestException('Cannot leave a completed challenge');

    try {
      await this.prisma.$transaction([
        this.prisma.challengeParticipant.delete({
          where: { challengeId_userId: { challengeId, userId } },
        }),
        this.prisma.challenge.update({
          where: { id: challengeId },
          data: { participantCount: { decrement: 1 } },
        }),
      ]);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
        return { success: true };
      }
      throw err;
    }
    // Ensure count doesn't go negative
    await this.prisma.challenge.updateMany({
      where: { id: challengeId, participantCount: { lt: 0 } },
      data: { participantCount: 0 },
    });
    return { success: true };
  }

  // ── Series (Micro-drama) ────────────────────────────────

  async createSeries(userId: string, dto: {
    title: string; description?: string; coverUrl?: string; category: string;
  }) {
    return this.prisma.series.create({
      data: { ...dto, category: dto.category as SeriesCategory, userId },
    });
  }

  async getSeries(seriesId: string) {
    const series = await this.prisma.series.findUnique({
      where: { id: seriesId },
      include: {
        creator: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        episodes: { orderBy: { number: 'asc' } },
        _count: { select: { followers: true } },
      },
    });
    if (!series) throw new NotFoundException('Series not found');
    return series;
  }

  async addEpisode(userId: string, seriesId: string, dto: {
    title: string; postId?: string; reelId?: string; videoId?: string;
  }) {
    const series = await this.prisma.series.findFirst({ where: { id: seriesId, userId } });
    if (!series) throw new NotFoundException();

    const lastEpisode = await this.prisma.seriesEpisode.findFirst({
      where: { seriesId },
      orderBy: { number: 'desc' },
    });

    const [episode] = await this.prisma.$transaction([
      this.prisma.seriesEpisode.create({
        data: {
          seriesId,
          number: (lastEpisode?.number || 0) + 1,
          title: dto.title,
          postId: dto.postId,
          reelId: dto.reelId,
          videoId: dto.videoId,
          releasedAt: new Date(),
        },
      }),
      this.prisma.series.update({
        where: { id: seriesId },
        data: { episodeCount: { increment: 1 } },
      }),
    ]);

    return episode;
  }

  async removeEpisode(userId: string, seriesId: string, episodeId: string) {
    const series = await this.prisma.series.findFirst({ where: { id: seriesId, userId } });
    if (!series) throw new NotFoundException('Series not found');

    const episode = await this.prisma.seriesEpisode.findUnique({ where: { id: episodeId } });
    if (!episode || episode.seriesId !== seriesId) throw new NotFoundException('Episode not found');

    await this.prisma.$transaction([
      this.prisma.seriesEpisode.delete({ where: { id: episodeId } }),
      this.prisma.$executeRaw`UPDATE "Series" SET "episodeCount" = GREATEST("episodeCount" - 1, 0) WHERE id = ${seriesId}`,
    ]);

    return { success: true };
  }

  async followSeries(userId: string, seriesId: string) {
    try {
      await this.prisma.$transaction([
        this.prisma.seriesFollower.create({ data: { seriesId, userId } }),
        this.prisma.series.update({
          where: { id: seriesId },
          data: { followersCount: { increment: 1 } },
        }),
      ]);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        throw new ConflictException('Already following');
      }
      throw err;
    }
    return { success: true };
  }

  async unfollowSeries(userId: string, seriesId: string) {
    try {
      await this.prisma.$transaction([
        this.prisma.seriesFollower.delete({
          where: { seriesId_userId: { seriesId, userId } },
        }),
        this.prisma.$executeRaw`UPDATE "Series" SET "followersCount" = GREATEST("followersCount" - 1, 0) WHERE id = ${seriesId}`,
      ]);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
        return { success: true }; // Already unfollowed — idempotent
      }
      throw err;
    }
    return { success: true };
  }

  async getDiscoverSeries(cursor?: string, limit = 20, category?: string) {
    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (cursor) where.id = { lt: cursor };

    const seriesList = await this.prisma.series.findMany({
      where,
      orderBy: { followersCount: 'desc' },
      take: limit + 1,
      include: {
        creator: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      },
    });

    const hasMore = seriesList.length > limit;
    if (hasMore) seriesList.pop();

    return {
      data: seriesList,
      meta: { cursor: seriesList[seriesList.length - 1]?.id || null, hasMore },
    };
  }

  // ── Series Progress Tracking ────────────────────────────

  async updateSeriesProgress(userId: string, seriesId: string, episodeNum: number, timestamp: number) {
    return this.prisma.seriesProgress.upsert({
      where: { seriesId_userId: { seriesId, userId } },
      create: {
        seriesId,
        userId,
        lastEpisodeNum: episodeNum,
        lastTimestamp: timestamp,
      },
      update: {
        lastEpisodeNum: episodeNum,
        lastTimestamp: timestamp,
      },
    });
  }

  async getSeriesProgress(userId: string, seriesId: string) {
    return this.prisma.seriesProgress.findUnique({
      where: { seriesId_userId: { seriesId, userId } },
    });
  }

  async getContinueWatching(userId: string) {
    const progress = await this.prisma.seriesProgress.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    if (progress.length === 0) return [];

    const seriesIds = progress.map(p => p.seriesId);
    const seriesList = await this.prisma.series.findMany({
      where: { id: { in: seriesIds } },
      include: {
        creator: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        episodes: { orderBy: { number: 'asc' }, select: { number: true, title: true, duration: true, thumbnailUrl: true } },
      },
    });

    const seriesMap = new Map(seriesList.map(s => [s.id, s]));

    return progress.map(p => {
      const series = seriesMap.get(p.seriesId);
      if (!series) return null;

      const currentEpisode = series.episodes.find(e => e.number === p.lastEpisodeNum);
      const totalDuration = currentEpisode?.duration || 0;
      const progressPercent = totalDuration > 0 ? Math.round((p.lastTimestamp / totalDuration) * 100) : 0;

      return {
        series: {
          id: series.id,
          title: series.title,
          coverUrl: series.coverUrl,
          creator: series.creator,
          episodeCount: series.episodeCount,
        },
        currentEpisode: {
          number: p.lastEpisodeNum,
          title: currentEpisode?.title || `Episode ${p.lastEpisodeNum}`,
          thumbnailUrl: currentEpisode?.thumbnailUrl || null,
        },
        timestamp: p.lastTimestamp,
        progressPercent,
        updatedAt: p.updatedAt,
      };
    }).filter(Boolean);
  }

  // ── Profile Customization ───────────────────────────────

  async getProfileCustomization(userId: string) {
    const custom = await this.prisma.profileCustomization.findUnique({ where: { userId } });
    if (!custom) {
      return this.prisma.profileCustomization.create({ data: { userId } });
    }
    return custom;
  }

  async updateProfileCustomization(userId: string, dto: {
    accentColor?: string; layoutStyle?: string; backgroundUrl?: string;
    backgroundMusic?: string; showBadges?: boolean; showLevel?: boolean;
    showStreak?: boolean; bioFont?: string;
  }) {
    const data = { ...dto, layoutStyle: dto.layoutStyle as ProfileLayout | undefined, bioFont: dto.bioFont as ProfileBioFont | undefined };
    return this.prisma.profileCustomization.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}

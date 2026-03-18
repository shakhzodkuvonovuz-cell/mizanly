import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

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

// Level thresholds
const LEVEL_THRESHOLDS = [
  0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500,
  7500, 10000, 13000, 17000, 22000, 28000, 35000, 43000, 52000, 65000,
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
  constructor(private prisma: PrismaService) {}

  // ── Streaks ─────────────────────────────────────────────

  async getStreaks(userId: string) {
    return this.prisma.userStreak.findMany({
      where: { userId },
      orderBy: { currentDays: 'desc' },
    });
  }

  async updateStreak(userId: string, streakType: string) {
    // Use UTC date string for timezone-safe comparison
    const todayStr = new Date().toISOString().slice(0, 10);
    const today = new Date(todayStr + 'T00:00:00.000Z');

    const streak = await this.prisma.userStreak.findUnique({
      where: { userId_streakType: { userId, streakType } },
    });

    if (!streak) {
      return this.prisma.userStreak.create({
        data: { userId, streakType, currentDays: 1, longestDays: 1, lastActiveDate: today },
      });
    }

    // Normalize to UTC date strings for reliable comparison
    const lastActiveStr = streak.lastActiveDate.toISOString().slice(0, 10);
    if (lastActiveStr === todayStr) return streak; // Already counted today

    const lastActiveDate = new Date(lastActiveStr + 'T00:00:00.000Z');
    const diffMs = today.getTime() - lastActiveDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Continue streak — use atomic increment to prevent race conditions
      const updated = await this.prisma.userStreak.update({
        where: { userId_streakType: { userId, streakType } },
        data: {
          currentDays: { increment: 1 },
          lastActiveDate: today,
        },
      });

      // Update longestDays if needed
      if (updated.currentDays > updated.longestDays) {
        await this.prisma.userStreak.update({
          where: { userId_streakType: { userId, streakType } },
          data: { longestDays: updated.currentDays },
        });
      }

      // Award XP for milestone streaks (fire-and-forget)
      if (updated.currentDays === 7) this.awardXP(userId, 'streak_milestone_7').catch(() => {});
      if (updated.currentDays === 30) this.awardXP(userId, 'streak_milestone_30').catch(() => {});
      if (updated.currentDays === 100) this.awardXP(userId, 'streak_milestone_100').catch(() => {});

      return updated;
    }

    // Streak broken — reset
    return this.prisma.userStreak.update({
      where: { userId_streakType: { userId, streakType } },
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
    const amount = customAmount || XP_REWARDS[reason] || 5;

    // Use upsert + atomic increment to avoid race conditions
    // when multiple XP awards happen concurrently
    const xp = await this.prisma.userXP.upsert({
      where: { userId },
      create: { userId, totalXP: amount, level: getLevelForXP(amount) },
      update: { totalXP: { increment: amount } },
    });

    // Recalculate level from the atomically-updated totalXP
    const newLevel = getLevelForXP(xp.totalXP);
    if (newLevel !== xp.level) {
      await this.prisma.userXP.update({
        where: { userId },
        data: { level: newLevel },
      });
    }

    await this.prisma.xPHistory.create({
      data: { userXPId: xp.id, amount, reason },
    });

    return { ...xp, level: newLevel };
  }

  async getXPHistory(userId: string, cursor?: string, limit = 20) {
    const xp = await this.prisma.userXP.findUnique({ where: { userId } });
    if (!xp) return { data: [], meta: { cursor: null, hasMore: false } };

    const where: Record<string, unknown> = { userXPId: xp.id };
    if (cursor) where.id = { lt: cursor };

    const history = await this.prisma.xPHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = history.length > limit;
    if (hasMore) history.pop();

    return {
      data: history,
      meta: { cursor: history[history.length - 1]?.id || null, hasMore },
    };
  }

  // ── Achievements ────────────────────────────────────────

  async getAchievements(userId: string) {
    const all = await this.prisma.achievement.findMany({ orderBy: { category: 'asc' } });
    const unlocked = await this.prisma.userAchievement.findMany({
      where: { userId },
      select: { achievementId: true, unlockedAt: true },
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
    if (type === 'xp') {
      return this.prisma.userXP.findMany({
        orderBy: { totalXP: 'desc' },
        take: limit,
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        },
      });
    }

    if (type === 'streaks') {
      return this.prisma.userStreak.findMany({
        where: { streakType: 'posting' },
        orderBy: { currentDays: 'desc' },
        take: limit,
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
        take: limit,
      });

      const userIds = topCommenters.map(c => c.userId);
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
      });
      const userMap = new Map(users.map(u => [u.id, u]));

      return topCommenters.map(c => ({
        user: userMap.get(c.userId),
        score: c._sum.likesCount || 0,
      }));
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

    return { success: true };
  }

  async updateChallengeProgress(userId: string, challengeId: string, progress: number) {
    const participant = await this.prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId, userId } },
      include: { challenge: true },
    });
    if (!participant) throw new NotFoundException('Not participating');

    const newProgress = Math.min(progress, participant.challenge.targetCount);
    const completed = newProgress >= participant.challenge.targetCount;

    const updated = await this.prisma.challengeParticipant.update({
      where: { challengeId_userId: { challengeId, userId } },
      data: {
        progress: newProgress,
        completed,
        completedAt: completed && !participant.completed ? new Date() : participant.completedAt,
      },
    });

    // Award XP on completion
    if (completed && !participant.completed) {
      await this.awardXP(userId, 'challenge_completed', participant.challenge.xpReward);
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
    });
  }

  // ── Series (Micro-drama) ────────────────────────────────

  async createSeries(userId: string, dto: {
    title: string; description?: string; coverUrl?: string; category: string;
  }) {
    return this.prisma.series.create({
      data: { ...dto, userId },
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

    const episode = await this.prisma.seriesEpisode.create({
      data: {
        seriesId,
        number: (lastEpisode?.number || 0) + 1,
        title: dto.title,
        postId: dto.postId,
        reelId: dto.reelId,
        videoId: dto.videoId,
        releasedAt: new Date(),
      },
    });

    await this.prisma.series.update({
      where: { id: seriesId },
      data: { episodeCount: { increment: 1 } },
    });

    return episode;
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
    await this.prisma.$transaction([
      this.prisma.seriesFollower.delete({
        where: { seriesId_userId: { seriesId, userId } },
      }),
      this.prisma.series.update({
        where: { id: seriesId },
        data: { followersCount: { decrement: 1 } },
      }),
    ]);
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
    return this.prisma.profileCustomization.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }
}

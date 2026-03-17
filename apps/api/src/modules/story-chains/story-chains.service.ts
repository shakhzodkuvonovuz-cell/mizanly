import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class StoryChainsService {
  constructor(private prisma: PrismaService) {}

  async createChain(userId: string, data: { prompt: string; coverUrl?: string }) {
    const prompt = data.prompt?.trim();
    if (!prompt || prompt.length === 0) {
      throw new BadRequestException('Prompt is required');
    }
    if (prompt.length > 300) {
      throw new BadRequestException('Prompt must be 300 characters or less');
    }

    return this.prisma.storyChain.create({
      data: {
        prompt,
        coverUrl: data.coverUrl,
        createdById: userId,
      },
    });
  }

  async getTrending(cursor?: string, limit = 20) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const chains = await this.prisma.storyChain.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: [
        { participantCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit + 1,
    });

    const hasMore = chains.length > limit;
    const data = hasMore ? chains.slice(0, limit) : chains;

    return {
      data,
      meta: {
        cursor: hasMore ? data[data.length - 1].id : null,
        hasMore,
      },
    };
  }

  async getChain(chainId: string, cursor?: string, limit = 20) {
    const chain = await this.prisma.storyChain.findUnique({
      where: { id: chainId },
    });

    if (!chain) {
      throw new NotFoundException('Story chain not found');
    }

    const entries = await this.prisma.storyChainEntry.findMany({
      where: {
        chainId,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = entries.length > limit;
    const data = hasMore ? entries.slice(0, limit) : entries;

    // Fetch associated stories and users
    const storyIds = data.map((e) => e.storyId);
    const userIds = data.map((e) => e.userId);

    const [stories, users] = await Promise.all([
      this.prisma.story.findMany({
        where: { id: { in: storyIds } },
        select: {
          id: true,
          mediaUrl: true,
          mediaType: true,
          thumbnailUrl: true,
          viewsCount: true,
          createdAt: true,
        },
      }),
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isVerified: true,
        },
      }),
    ]);

    const storyMap = new Map(stories.map((s) => [s.id, s]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    const entriesWithDetails = data.map((entry) => ({
      ...entry,
      story: storyMap.get(entry.storyId) ?? null,
      user: userMap.get(entry.userId) ?? null,
    }));

    return {
      chain,
      entries: {
        data: entriesWithDetails,
        meta: {
          cursor: hasMore ? data[data.length - 1].id : null,
          hasMore,
        },
      },
    };
  }

  async joinChain(chainId: string, userId: string, storyId: string) {
    const chain = await this.prisma.storyChain.findUnique({
      where: { id: chainId },
    });

    if (!chain) {
      throw new NotFoundException('Story chain not found');
    }

    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

    if (story.userId !== userId) {
      throw new BadRequestException('Story does not belong to you');
    }

    // Upsert to handle duplicate entries gracefully
    const entry = await this.prisma.storyChainEntry.upsert({
      where: {
        chainId_userId: { chainId, userId },
      },
      create: {
        chainId,
        storyId,
        userId,
      },
      update: {
        storyId,
      },
    });

    // Only increment if this is a new entry (createdAt matches now)
    const isNew = entry.createdAt.getTime() > Date.now() - 1000;
    if (isNew) {
      await this.prisma.storyChain.update({
        where: { id: chainId },
        data: { participantCount: { increment: 1 } },
      });
    }

    return entry;
  }

  async getStats(chainId: string) {
    const chain = await this.prisma.storyChain.findUnique({
      where: { id: chainId },
    });

    if (!chain) {
      throw new NotFoundException('Story chain not found');
    }

    return {
      participantCount: chain.participantCount,
      viewsCount: chain.viewsCount,
      createdAt: chain.createdAt,
      createdBy: chain.createdById,
    };
  }
}

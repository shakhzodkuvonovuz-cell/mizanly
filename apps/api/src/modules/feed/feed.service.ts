import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ContentSpace } from '@prisma/client';

@Injectable()
export class FeedService {
  constructor(private prisma: PrismaService) {}

  async logInteraction(userId: string, data: { postId: string; space: string; viewed?: boolean; viewDurationMs?: number; completionRate?: number; liked?: boolean; commented?: boolean; shared?: boolean; saved?: boolean }) {
    // Find existing interaction
    const existing = await this.prisma.feedInteraction.findFirst({
      where: { userId, postId: data.postId },
    });
    if (existing) {
      return this.prisma.feedInteraction.update({
        where: { id: existing.id },
        data: {
          viewed: data.viewed,
          viewDurationMs: data.viewDurationMs,
          completionRate: data.completionRate,
          liked: data.liked,
          commented: data.commented,
          shared: data.shared,
          saved: data.saved,
        },
      });
    } else {
      return this.prisma.feedInteraction.create({
        data: {
          userId,
          postId: data.postId,
          space: data.space as ContentSpace,
          viewed: data.viewed ?? false,
          viewDurationMs: data.viewDurationMs ?? 0,
          completionRate: data.completionRate,
          liked: data.liked ?? false,
          commented: data.commented ?? false,
          shared: data.shared ?? false,
          saved: data.saved ?? false,
        },
      });
    }
  }

  async dismiss(userId: string, contentId: string, contentType: string) {
    return this.prisma.feedDismissal.upsert({
      where: { userId_contentId_contentType: { userId, contentId, contentType } },
      update: {},
      create: { userId, contentId, contentType },
    });
  }

  async getDismissedIds(userId: string, contentType: string): Promise<string[]> {
    const d = await this.prisma.feedDismissal.findMany({ where: { userId, contentType }, select: { contentId: true } });
    return d.map(x => x.contentId);
  }

  async getUserInterests(userId: string): Promise<Record<string, number>> {
    const interactions = await this.prisma.feedInteraction.findMany({ where: { userId, viewed: true }, select: { space: true, viewDurationMs: true, liked: true, commented: true, shared: true, saved: true }, orderBy: { createdAt: 'desc' }, take: 200 });
    const scores: Record<string, number> = {};
    for (const i of interactions) {
      const w = (i.liked ? 2 : 0) + (i.commented ? 3 : 0) + (i.shared ? 4 : 0) + (i.saved ? 3 : 0) + Math.min(i.viewDurationMs / 10000, 5);
      scores[i.space] = (scores[i.space] || 0) + w;
    }
    return scores;
  }

  async undismiss(userId: string, contentId: string, contentType: string) {
    await this.prisma.feedDismissal.delete({ where: { userId_contentId_contentType: { userId, contentId, contentType } } }).catch(() => {});
    return { undismissed: true };
  }
}
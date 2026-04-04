import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { ThumbnailContentType } from '@prisma/client';

type ContentType = 'POST' | 'REEL' | 'VIDEO';

const MAX_VARIANTS = 3;
const WINNER_THRESHOLD = 1000; // impressions before declaring winner

@Injectable()
export class ThumbnailsService {
  private readonly logger = new Logger(ThumbnailsService.name);
  constructor(private prisma: PrismaService) {}

  /**
   * Upload thumbnail variants for A/B testing.
   * Max 3 variants per piece of content.
   */
  async createVariants(contentType: ContentType, contentId: string, thumbnailUrls: string[], userId?: string) {
    if (thumbnailUrls.length < 2 || thumbnailUrls.length > MAX_VARIANTS) {
      throw new BadRequestException(`Provide 2-${MAX_VARIANTS} thumbnail variants`);
    }

    // Verify ownership of the content
    if (userId) {
      await this.verifyContentOwnership(contentType, contentId, userId);
    }

    // Check if variants already exist
    const existing = await this.prisma.thumbnailVariant.count({
      where: { contentType, contentId },
    });
    if (existing > 0) {
      throw new BadRequestException('Thumbnail variants already exist for this content');
    }

    const variants = await Promise.all(
      thumbnailUrls.map(url =>
        this.prisma.thumbnailVariant.create({
          data: { contentType, contentId, thumbnailUrl: url },
        }),
      ),
    );

    return variants;
  }

  /**
   * Get variants with stats for creator analytics.
   */
  async getVariants(contentType: ContentType, contentId: string, userId?: string) {
    // Verify ownership — only the content creator should see A/B test analytics
    if (userId) {
      await this.verifyContentOwnership(contentType, contentId, userId);
    }

    const variants = await this.prisma.thumbnailVariant.findMany({
      where: { contentType, contentId },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    if (variants.length === 0) return null;

    const totalImpressions = variants.reduce((sum, v) => sum + v.impressions, 0);
    const winner = variants.find(v => v.isWinner);

    return {
      variants: variants.map((v, i) => ({
        id: v.id,
        thumbnailUrl: v.thumbnailUrl,
        impressions: v.impressions,
        clicks: v.clicks,
        ctr: v.impressions > 0 ? Math.round((v.clicks / v.impressions) * 10000) / 100 : 0,
        isWinner: v.isWinner,
        variantNum: i + 1,
      })),
      totalImpressions,
      testComplete: !!winner,
      winner: winner ? { id: winner.id, thumbnailUrl: winner.thumbnailUrl } : null,
    };
  }

  /**
   * Serve the appropriate thumbnail for a viewer.
   * If testing: randomly assign a variant.
   * If winner declared: always serve winner.
   */
  async serveThumbnail(contentType: ContentType, contentId: string): Promise<{
    thumbnailUrl: string;
    variantId: string;
  } | null> {
    const variants = await this.prisma.thumbnailVariant.findMany({
      where: { contentType, contentId },
      take: 10,
    });

    if (variants.length === 0) return null;

    // If winner declared, always serve winner
    const winner = variants.find(v => v.isWinner);
    if (winner) {
      return { thumbnailUrl: winner.thumbnailUrl, variantId: winner.id };
    }

    // Random assignment for A/B testing — return variantId so the client
    // can report impressions/clicks back via trackImpression/trackClick
    const idx = randomInt(variants.length);
    const selected = variants[idx];

    // Auto-track impression on serve (fire-and-forget)
    this.prisma.thumbnailVariant.update({
      where: { id: selected.id },
      data: { impressions: { increment: 1 } },
    }).then(() => this.checkForWinner(contentType, contentId)).catch(err => this.logger.warn('Failed to check thumbnail winner', err instanceof Error ? err.message : err));

    return { thumbnailUrl: selected.thumbnailUrl, variantId: selected.id };
  }

  /**
   * Track an impression (content appeared in feed).
   */
  async trackImpression(variantId: string) {
    const variant = await this.prisma.thumbnailVariant.update({
      where: { id: variantId },
      data: { impressions: { increment: 1 } },
    });

    // Check if we should declare a winner
    await this.checkForWinner(variant.contentType, variant.contentId);

    return { tracked: true };
  }

  /**
   * Track a click (content was opened from feed).
   */
  async trackClick(variantId: string) {
    await this.prisma.thumbnailVariant.update({
      where: { id: variantId },
      data: { clicks: { increment: 1 } },
    });
    return { tracked: true };
  }

  /**
   * Check if total impressions exceed threshold and declare winner.
   */
  private async checkForWinner(contentType: string, contentId: string) {
    const variants = await this.prisma.thumbnailVariant.findMany({
      where: { contentType: contentType as ThumbnailContentType, contentId },
      take: 10,
    });

    // Already has a winner
    if (variants.some(v => v.isWinner)) return;

    const totalImpressions = variants.reduce((sum, v) => sum + v.impressions, 0);
    if (totalImpressions < WINNER_THRESHOLD) return;

    // Find variant with highest CTR
    let bestVariant = variants[0];
    let bestCTR = 0;

    for (const v of variants) {
      if (v.impressions === 0) continue;
      const ctr = v.clicks / v.impressions;
      if (ctr > bestCTR) {
        bestCTR = ctr;
        bestVariant = v;
      }
    }

    // Declare winner
    await this.prisma.thumbnailVariant.update({
      where: { id: bestVariant.id },
      data: { isWinner: true },
    });
  }

  /**
   * Verify the requesting user owns the content they're creating/viewing variants for.
   */
  private async verifyContentOwnership(contentType: ContentType, contentId: string, userId: string) {
    let ownerId: string | null = null;
    if (contentType === 'POST') {
      const post = await this.prisma.post.findUnique({ where: { id: contentId }, select: { userId: true } });
      ownerId = post?.userId ?? null;
    } else if (contentType === 'REEL') {
      const reel = await this.prisma.reel.findUnique({ where: { id: contentId }, select: { userId: true } });
      ownerId = reel?.userId ?? null;
    } else if (contentType === 'VIDEO') {
      const video = await this.prisma.video.findUnique({ where: { id: contentId }, select: { userId: true } });
      ownerId = video?.userId ?? null;
    }
    if (!ownerId) throw new NotFoundException('Content not found');
    if (ownerId !== userId) throw new ForbiddenException('You can only manage thumbnails for your own content');
  }
}

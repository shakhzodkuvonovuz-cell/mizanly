import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

type ContentType = 'post' | 'reel' | 'video';

const MAX_VARIANTS = 3;
const WINNER_THRESHOLD = 1000; // impressions before declaring winner

@Injectable()
export class ThumbnailsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Upload thumbnail variants for A/B testing.
   * Max 3 variants per piece of content.
   */
  async createVariants(contentType: ContentType, contentId: string, thumbnailUrls: string[]) {
    if (thumbnailUrls.length < 2 || thumbnailUrls.length > MAX_VARIANTS) {
      throw new BadRequestException(`Provide 2-${MAX_VARIANTS} thumbnail variants`);
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
  async getVariants(contentType: ContentType, contentId: string) {
    const variants = await this.prisma.thumbnailVariant.findMany({
      where: { contentType, contentId },
      orderBy: { createdAt: 'asc' },
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
  async serveThumbnail(contentType: ContentType, contentId: string): Promise<string | null> {
    const variants = await this.prisma.thumbnailVariant.findMany({
      where: { contentType, contentId },
    });

    if (variants.length === 0) return null;

    // If winner declared, always serve winner
    const winner = variants.find(v => v.isWinner);
    if (winner) return winner.thumbnailUrl;

    // Random assignment for A/B testing
    const idx = Math.floor(Math.random() * variants.length);
    return variants[idx].thumbnailUrl;
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
      where: { contentType, contentId },
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
}

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

interface BoostPostData {
  postId: string;
  budget: number;
  duration: number;
}

interface SetReminderData {
  postId: string;
  remindAt: string;
}

const REACH_MULTIPLIER = 100;
const MAX_BUDGET = 10000;
const MAX_DURATION_DAYS = 30;

@Injectable()
export class PromotionsService {
  constructor(private prisma: PrismaService) {}

  async boostPost(userId: string, data: BoostPostData) {
    const { postId, budget, duration } = data;

    if (budget <= 0 || budget > MAX_BUDGET) {
      throw new BadRequestException(
        `Budget must be between $0.01 and $${MAX_BUDGET}`,
      );
    }
    if (duration <= 0 || duration > MAX_DURATION_DAYS) {
      throw new BadRequestException(
        `Duration must be between 1 and ${MAX_DURATION_DAYS} days`,
      );
    }

    // Verify post exists and belongs to user
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (post.userId !== userId) {
      throw new ForbiddenException('You can only promote your own posts');
    }

    // Check for existing active promotion on same post
    const existing = await this.prisma.postPromotion.findFirst({
      where: { postId, userId, status: 'active' },
    });
    if (existing) {
      throw new BadRequestException('Post already has an active promotion');
    }

    const targetReach = Math.floor(budget * REACH_MULTIPLIER);
    const now = new Date();
    const endsAt = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);

    const promotion = await this.prisma.postPromotion.create({
      data: {
        postId,
        userId,
        budget,
        currency: 'USD',
        targetReach,
        actualReach: 0,
        status: 'active',
        startsAt: now,
        endsAt,
      },
    });

    return promotion;
  }

  async getMyPromotions(userId: string) {
    const promotions = await this.prisma.postPromotion.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { data: promotions };
  }

  async cancelPromotion(id: string, userId: string) {
    const promotion = await this.prisma.postPromotion.findUnique({
      where: { id },
    });
    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }
    if (promotion.userId !== userId) {
      throw new ForbiddenException('You can only cancel your own promotions');
    }
    if (promotion.status !== 'active') {
      throw new BadRequestException('Promotion is not active');
    }

    const updated = await this.prisma.postPromotion.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    return updated;
  }

  async setReminder(userId: string, postId: string, remindAt: string) {
    const remindDate = new Date(remindAt);
    if (isNaN(remindDate.getTime())) {
      throw new BadRequestException('Invalid date format for remindAt');
    }
    if (remindDate.getTime() <= Date.now()) {
      throw new BadRequestException('Reminder time must be in the future');
    }

    // Verify post exists
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const reminder = await this.prisma.postReminder.upsert({
      where: { postId_userId: { postId, userId } },
      update: { remindAt: remindDate, sent: false },
      create: { postId, userId, remindAt: remindDate },
    });

    return reminder;
  }

  async removeReminder(userId: string, postId: string) {
    const reminder = await this.prisma.postReminder.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    await this.prisma.postReminder.delete({
      where: { postId_userId: { postId, userId } },
    });

    return { message: 'Reminder removed' };
  }

  async markBranded(userId: string, postId: string, partnerName: string) {
    if (!partnerName.trim()) {
      throw new BadRequestException('Partner name is required');
    }

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true, content: true },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (post.userId !== userId) {
      throw new ForbiddenException('You can only mark your own posts as branded');
    }

    // Store branded partnership info in content metadata via a tag prefix
    // Format: [Paid partnership with PartnerName]
    // Strip brackets from partnerName to prevent regex injection in removal
    const safePartnerName = partnerName.trim().replace(/[\[\]]/g, '');
    const brandedTag = `[Paid partnership with ${safePartnerName}]`;
    const currentContent = post.content || '';

    // Remove existing branded tag if present
    const cleanedContent = currentContent
      .replace(/\[Paid partnership with [^\]]*\]\s*/g, '')
      .trim();

    const updatedContent = `${brandedTag} ${cleanedContent}`.trim();

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: { content: updatedContent },
      select: {
        id: true,
        content: true,
        userId: true,
      },
    });

    return {
      postId: updated.id,
      partnerName: partnerName.trim(),
      content: updated.content,
    };
  }
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(private prisma: PrismaService) {}

  async exportUserData(userId: string) {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profileLinks: true, channel: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const [posts, threads, stories, messages, follows] = await Promise.all([
      this.prisma.post.findMany({ where: { userId }, select: { id: true, content: true, mediaUrls: true, createdAt: true },
      take: 50,
    }),
      this.prisma.thread.findMany({ where: { userId }, select: { id: true, content: true, createdAt: true },
      take: 50,
    }),
      this.prisma.story.findMany({ where: { userId }, select: { id: true, mediaUrl: true, createdAt: true },
      take: 50,
    }),
      this.prisma.message.findMany({ where: { senderId: userId }, select: { id: true, content: true, createdAt: true }, take: 10000 }),
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true },
      take: 50,
    }),
    ]);

    this.logger.log(`Data export requested for user ${userId}`);

    return {
      profile: user,
      posts,
      threads,
      stories,
      messages: { count: messages.length, data: messages },
      following: follows.map(f => f.followingId),
      exportedAt: new Date().toISOString(),
    };
  }

  async deleteAllUserData(userId: string) {
    // Verify user exists before attempting deletion
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isDeleted: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isDeleted) throw new NotFoundException('User account already deleted');

    this.logger.warn(`Full data deletion requested for user ${userId}`);

    // Soft-delete: anonymize PII and mark as deleted (GDPR Article 17)
    // Do NOT hard-delete — preserve referential integrity and audit trail
    await this.prisma.$transaction(async (tx) => {
      // Anonymize user profile
      await tx.user.update({
        where: { id: userId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          isDeactivated: true,
          deactivatedAt: new Date(),
          displayName: 'Deleted User',
          username: `deleted_${userId.slice(0, 8)}`,
          bio: '',
          avatarUrl: null,
          coverUrl: null,
          website: null,
          email: `deleted_${userId}@deleted.local`,
          phone: null,
          expoPushToken: null,
          notificationsOn: false,
        },
      });

      // Soft-delete user content
      await tx.post.updateMany({
        where: { userId },
        data: { isRemoved: true, removedReason: 'Account deleted by user', removedAt: new Date() },
      });
      await tx.thread.updateMany({
        where: { userId },
        data: { isRemoved: true },
      });
      await tx.comment.updateMany({
        where: { userId },
        data: { isRemoved: true },
      });
      await tx.story.deleteMany({ where: { userId } });

      // Delete profile links
      await tx.profileLink.deleteMany({ where: { userId } });
    });

    return { deleted: true, userId, deletedAt: new Date().toISOString() };
  }
}
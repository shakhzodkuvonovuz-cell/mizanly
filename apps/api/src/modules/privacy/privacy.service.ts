import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(private prisma: PrismaService) {}

  async exportUserData(userId: string) {
    const [user, posts, threads, stories, messages, follows] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, include: { profileLinks: true, channel: true } }),
      this.prisma.post.findMany({ where: { userId }, select: { id: true, content: true, mediaUrls: true, createdAt: true } }),
      this.prisma.thread.findMany({ where: { userId }, select: { id: true, content: true, createdAt: true } }),
      this.prisma.story.findMany({ where: { userId }, select: { id: true, mediaUrl: true, createdAt: true } }),
      this.prisma.message.findMany({ where: { senderId: userId }, select: { id: true, content: true, createdAt: true }, take: 10000 }),
      this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
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
    // Prisma cascade handles most deletions, but log the action
    this.logger.warn(`Full data deletion requested for user ${userId}`);

    await this.prisma.user.delete({ where: { id: userId } });

    return { deleted: true, userId, deletedAt: new Date().toISOString() };
  }
}
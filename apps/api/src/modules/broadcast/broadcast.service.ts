import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, Inject, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { ChannelRole, ChannelType, MessageType } from '@prisma/client';
import Redis from 'ioredis';

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private queueService: QueueService | null,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async create(userId: string, data: { name: string; slug: string; description?: string; avatarUrl?: string }) {
    const existing = await this.prisma.broadcastChannel.findUnique({ where: { slug: data.slug }, select: { id: true } });
    if (existing) throw new ConflictException('Slug already taken');

    return this.prisma.$transaction(async (tx) => {
      const channel = await tx.broadcastChannel.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          avatarUrl: data.avatarUrl,
          channelType: ChannelType.BROADCAST,
          subscribersCount: 1,
        },
      });
      await tx.channelMember.create({
        data: { channelId: channel.id, userId, role: ChannelRole.OWNER },
      });
      return channel;
    });
  }

  async getBySlug(slug: string) {
    const channel = await this.prisma.broadcastChannel.findUnique({ where: { slug } });
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  async getById(channelId: string) {
    const channel = await this.prisma.broadcastChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  async update(channelId: string, userId: string, data: { name?: string; slug?: string; description?: string; avatarUrl?: string }) {
    await this.requireRole(channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);

    // Audit 06 F58: Prevent slug changes after creation — slugs are permanent identifiers
    if (data.slug !== undefined) {
      const existing = await this.prisma.broadcastChannel.findUnique({ where: { id: channelId }, select: { slug: true } });
      if (existing && data.slug !== existing.slug) {
        throw new BadRequestException('Cannot change broadcast channel slug after creation');
      }
    }

    // Strip slug from update payload — it should never be written
    const { slug: _slug, ...updateData } = data;
    return this.prisma.broadcastChannel.update({
      where: { id: channelId },
      data: updateData,
    });
  }

  async delete(channelId: string, userId: string) {
    await this.requireRole(channelId, userId, [ChannelRole.OWNER]);
    await this.prisma.broadcastChannel.delete({ where: { id: channelId } });
    return { deleted: true };
  }

  async subscribe(channelId: string, userId: string) {
    await this.getById(channelId);
    const existing = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
      select: { channelId: true, userId: true, role: true },
    });
    if (existing) return existing;

    try {
      const [member] = await this.prisma.$transaction([
        this.prisma.channelMember.create({
          data: { channelId, userId, role: ChannelRole.SUBSCRIBER },
        }),
        this.prisma.$executeRaw`UPDATE broadcast_channels SET "subscribersCount" = "subscribersCount" + 1 WHERE id = ${channelId}`,
      ]);
      return member;
    } catch (err) {
      // P2002: race condition duplicate — idempotent
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const member = await this.prisma.channelMember.findUnique({
          where: { channelId_userId: { channelId, userId } },
          select: { channelId: true, userId: true, role: true },
        });
        return member;
      }
      throw err;
    }
  }

  async unsubscribe(channelId: string, userId: string) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
      select: { channelId: true, userId: true, role: true },
    });
    if (!member) return { unsubscribed: true };
    if (member.role === ChannelRole.OWNER) throw new ForbiddenException('Owner cannot unsubscribe');

    await this.prisma.$transaction([
      this.prisma.channelMember.delete({
        where: { channelId_userId: { channelId, userId } },
      }),
      this.prisma.$executeRaw`UPDATE broadcast_channels SET "subscribersCount" = GREATEST("subscribersCount" - 1, 0) WHERE id = ${channelId}`,
    ]);
    return { unsubscribed: true };
  }

  async getSubscribers(channelId: string, cursor?: string, userId?: string, limit = 20) {
    // Only channel owner/admin can view the subscriber list
    if (userId) {
      await this.requireRole(channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    }
    const where: Prisma.ChannelMemberWhereInput = { channelId };
    // Fix #159: Composite cursor (joinedAt:userId) prevents duplicates when
    // multiple members share the same joinedAt timestamp.
    if (cursor) {
      const sepIdx = cursor.lastIndexOf(':');
      if (sepIdx > 0) {
        const cursorDate = new Date(cursor.substring(0, sepIdx));
        const cursorUserId = cursor.substring(sepIdx + 1);
        if (!isNaN(cursorDate.getTime())) {
          where.OR = [
            { joinedAt: { lt: cursorDate } },
            { joinedAt: cursorDate, userId: { lt: cursorUserId } },
          ];
        }
      }
    }
    const members = await this.prisma.channelMember.findMany({
      where,
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: [{ joinedAt: 'desc' }, { userId: 'desc' }],
      take: limit + 1,
    });
    const hasMore = members.length > limit;
    if (hasMore) members.pop();
    const last = members[members.length - 1];
    const nextCursor = last ? `${last.joinedAt.toISOString()}:${last.userId}` : null;
    return { data: members, meta: { cursor: nextCursor, hasMore } };
  }

  async sendMessage(channelId: string, userId: string, data: { content?: string; messageType?: string; mediaUrl?: string; mediaType?: string }) {
    await this.requireRole(channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);

    // A16-#9 FIX: Reject empty messages (no content AND no media)
    if (!data.content?.trim() && !data.mediaUrl) {
      throw new BadRequestException('Message must have content or media');
    }

    const msg = await this.prisma.broadcastMessage.create({
      data: {
        channelId,
        senderId: userId,
        content: data.content,
        messageType: (data.messageType as MessageType) ?? MessageType.TEXT, // Validated by SendBroadcastDto @IsEnum
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
      },
      include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });
    await this.prisma.$executeRaw`UPDATE broadcast_channels SET "postsCount" = "postsCount" + 1 WHERE id = ${channelId}`;

    // Use bulk-push queue for subscriber notifications (durable, retried, batched)
    this.prisma.channelMember.findMany({
      where: { channelId, userId: { not: userId }, isMuted: false },
      select: { userId: true },
      take: 10000,
    }).then(async (subscribers) => {
      if (subscribers.length > 0) {
        const userIds = subscribers.map(s => s.userId);
        const title = 'New broadcast';
        const body = data.content?.slice(0, 100) || 'New message in channel';

        if (this.queueService) {
          // Route through bulk-push queue for durable delivery with retry
          const BATCH = 500;
          for (let i = 0; i < userIds.length; i += BATCH) {
            const batch = userIds.slice(i, i + BATCH);
            this.queueService.addBulkPushJob({
              userIds: batch,
              title,
              body,
              pushData: { screen: 'broadcast', channelId },
            }).catch(err => this.logger.warn(`Bulk-push queue job failed: ${err instanceof Error ? err.message : err}`));
          }
        } else {
          // Fallback: inline notification creation when queue is unavailable
          const BATCH = 500;
          for (let i = 0; i < userIds.length; i += BATCH) {
            const batch = userIds.slice(i, i + BATCH);
            await this.prisma.notification.createMany({
              data: batch.map(uid => ({
                userId: uid,
                actorId: userId,
                type: 'SYSTEM' as const,
                title,
                body,
              })),
              skipDuplicates: true,
            }).catch(err => this.logger.warn(`Broadcast notification batch failed: ${err instanceof Error ? err.message : err}`));
          }
        }
      }
      // Emit socket event for real-time update
      this.redis.publish('content:update', JSON.stringify({
        event: 'broadcast_message',
        data: { channelId, messageId: msg.id },
      })).catch((err) => this.logger.warn('Broadcast redis publish failed', err?.message));
    }).catch(err => this.logger.warn(`Broadcast notification failed: ${err?.message}`));

    return msg;
  }

  async getMessages(channelId: string, cursor?: string, limit = 30) {
    const where: Prisma.BroadcastMessageWhereInput = { channelId };
    if (cursor) {
      where.id = { lt: cursor };
    }
    const messages = await this.prisma.broadcastMessage.findMany({
      where,
      include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();
    return { data: messages, meta: { cursor: messages[messages.length - 1]?.id ?? null, hasMore } };
  }

  async pinMessage(messageId: string, userId: string) {
    // J08-#27 FIX: Lightweight select for permission checks (was fetching full row with content)
    const msg = await this.prisma.broadcastMessage.findUnique({ where: { id: messageId }, select: { id: true, channelId: true } });
    if (!msg) throw new NotFoundException('Message not found');
    await this.requireRole(msg.channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    return this.prisma.broadcastMessage.update({ where: { id: messageId }, data: { isPinned: true } });
  }

  async unpinMessage(messageId: string, userId: string) {
    const msg = await this.prisma.broadcastMessage.findUnique({ where: { id: messageId }, select: { id: true, channelId: true } });
    if (!msg) throw new NotFoundException('Message not found');
    await this.requireRole(msg.channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    return this.prisma.broadcastMessage.update({ where: { id: messageId }, data: { isPinned: false } });
  }

  async deleteMessage(messageId: string, userId: string) {
    const msg = await this.prisma.broadcastMessage.findUnique({ where: { id: messageId }, select: { id: true, channelId: true } });
    if (!msg) throw new NotFoundException('Message not found');
    await this.requireRole(msg.channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    await this.prisma.broadcastMessage.delete({ where: { id: messageId } });
    await this.prisma.$executeRaw`UPDATE broadcast_channels SET "postsCount" = GREATEST("postsCount" - 1, 0) WHERE id = ${msg.channelId}`;
    return { deleted: true };
  }

  async getPinnedMessages(channelId: string) {
    return this.prisma.broadcastMessage.findMany({
      where: { channelId, isPinned: true },
      include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async muteChannel(channelId: string, userId: string, muted: boolean) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
      select: { channelId: true, userId: true },
    });
    if (!member) throw new NotFoundException('Not subscribed to this channel');
    return this.prisma.channelMember.update({
      where: { channelId_userId: { channelId, userId } },
      data: { isMuted: muted },
    });
  }

  async getMyChannels(userId: string) {
    const memberships = await this.prisma.channelMember.findMany({
      where: { userId },
      include: {
        channel: {
          select: { id: true, name: true, slug: true, avatarUrl: true, subscribersCount: true, channelType: true },
        },
      },
      orderBy: { joinedAt: 'desc' },
      take: 50,
    });
    return memberships.map(m => ({ ...m.channel, role: m.role, isMuted: m.isMuted }));
  }

  async discover(cursor?: string, limit = 20) {
    const channels = await this.prisma.broadcastChannel.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { subscribersCount: 'desc' },
      take: limit + 1,
    });
    const hasMore = channels.length > limit;
    if (hasMore) channels.pop();
    return { data: channels, meta: { cursor: channels[channels.length - 1]?.id ?? null, hasMore } };
  }

  async promoteToAdmin(channelId: string, ownerId: string, targetUserId: string) {
    await this.requireRole(channelId, ownerId, [ChannelRole.OWNER]);
    const target = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      select: { channelId: true, userId: true, role: true },
    });
    if (!target) throw new NotFoundException('User is not a subscriber of this channel');
    if (target.role === ChannelRole.OWNER) throw new ForbiddenException('Cannot change owner role');
    return this.prisma.channelMember.update({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      data: { role: ChannelRole.ADMIN },
    });
  }

  async demoteFromAdmin(channelId: string, ownerId: string, targetUserId: string) {
    await this.requireRole(channelId, ownerId, [ChannelRole.OWNER]);
    const target = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      select: { channelId: true, userId: true, role: true },
    });
    if (!target) throw new NotFoundException('User is not a subscriber of this channel');
    if (target.role === ChannelRole.OWNER) throw new ForbiddenException('Cannot change owner role');
    return this.prisma.channelMember.update({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      data: { role: ChannelRole.SUBSCRIBER },
    });
  }

  async removeSubscriber(channelId: string, userId: string, targetUserId: string) {
    await this.requireRole(channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    const target = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      select: { channelId: true, userId: true, role: true },
    });
    if (!target) throw new NotFoundException('User is not a subscriber of this channel');
    if (target.role === ChannelRole.OWNER) throw new ForbiddenException('Cannot remove channel owner');
    await this.prisma.channelMember.delete({
      where: { channelId_userId: { channelId, userId: targetUserId } },
    });
    await this.prisma.$executeRaw`UPDATE broadcast_channels SET "subscribersCount" = GREATEST("subscribersCount" - 1, 0) WHERE id = ${channelId}`;
    return { removed: true };
  }

  private async requireRole(channelId: string, userId: string, roles: ChannelRole[]) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
      select: { channelId: true, userId: true, role: true },
    });
    if (!member || !roles.includes(member.role)) {
      throw new ForbiddenException('Insufficient channel permissions');
    }
    return member;
  }
}

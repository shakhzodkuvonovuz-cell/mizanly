import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import { ChannelRole, ChannelType, MessageType } from '@prisma/client';

@Injectable()
export class BroadcastService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, data: { name: string; slug: string; description?: string; avatarUrl?: string }) {
    const existing = await this.prisma.broadcastChannel.findUnique({ where: { slug: data.slug } });
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

  async update(channelId: string, userId: string, data: { name?: string; description?: string; avatarUrl?: string }) {
    await this.requireRole(channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    return this.prisma.broadcastChannel.update({
      where: { id: channelId },
      data,
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
    });
    if (existing) return existing;

    try {
      const member = await this.prisma.channelMember.create({
        data: { channelId, userId, role: ChannelRole.SUBSCRIBER },
      });
      await this.prisma.$executeRaw`UPDATE broadcast_channels SET "subscribersCount" = "subscribersCount" + 1 WHERE id = ${channelId}`;
      return member;
    } catch (err) {
      // P2002: race condition duplicate — idempotent
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const member = await this.prisma.channelMember.findUnique({
          where: { channelId_userId: { channelId, userId } },
        });
        return member;
      }
      throw err;
    }
  }

  async unsubscribe(channelId: string, userId: string) {
    const member = await this.prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!member) return { unsubscribed: true };
    if (member.role === ChannelRole.OWNER) throw new ForbiddenException('Owner cannot unsubscribe');

    await this.prisma.channelMember.delete({
      where: { channelId_userId: { channelId, userId } },
    });
    await this.prisma.$executeRaw`UPDATE broadcast_channels SET "subscribersCount" = GREATEST("subscribersCount" - 1, 0) WHERE id = ${channelId}`;
    return { unsubscribed: true };
  }

  async getSubscribers(channelId: string, cursor?: string, userId?: string, limit = 20) {
    // Only channel owner/admin can view the subscriber list
    if (userId) {
      await this.requireRole(channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    }
    const where: Prisma.ChannelMemberWhereInput = { channelId };
    if (cursor) {
      where.joinedAt = { lt: new Date(cursor) };
    }
    const members = await this.prisma.channelMember.findMany({
      where,
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } } },
      orderBy: { joinedAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = members.length > limit;
    if (hasMore) members.pop();
    return { data: members, meta: { cursor: members[members.length - 1]?.joinedAt?.toISOString() ?? null, hasMore } };
  }

  async sendMessage(channelId: string, userId: string, data: { content?: string; messageType?: string; mediaUrl?: string; mediaType?: string }) {
    await this.requireRole(channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
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
    const msg = await this.prisma.broadcastMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    await this.requireRole(msg.channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    return this.prisma.broadcastMessage.update({ where: { id: messageId }, data: { isPinned: true } });
  }

  async unpinMessage(messageId: string, userId: string) {
    const msg = await this.prisma.broadcastMessage.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    await this.requireRole(msg.channelId, userId, [ChannelRole.OWNER, ChannelRole.ADMIN]);
    return this.prisma.broadcastMessage.update({ where: { id: messageId }, data: { isPinned: false } });
  }

  async deleteMessage(messageId: string, userId: string) {
    const msg = await this.prisma.broadcastMessage.findUnique({ where: { id: messageId } });
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
      include: { channel: true },
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
    });
    if (!member || !roles.includes(member.role)) {
      throw new ForbiddenException('Insufficient channel permissions');
    }
    return member;
  }
}

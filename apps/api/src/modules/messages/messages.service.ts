import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async getConversations(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            members: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, lastSeenAt: true } } } },
            messages: { take: 1, orderBy: { createdAt: 'desc' }, select: { id: true, content: true, type: true, senderId: true, createdAt: true } },
          },
        },
      },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
    });
    return memberships.map(m => ({ ...m.conversation, isMuted: m.isMuted, isPinned: m.isPinned, lastReadAt: m.lastReadAt }));
  }

  async getMessages(conversationId: string, userId: string, cursor?: string, limit = 50) {
    // Verify membership
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this conversation');

    return this.prisma.message.findMany({
      where: { conversationId, isDeleted: false },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        replyTo: { select: { id: true, content: true, senderId: true } },
        reactions: true,
      },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
  }

  async sendMessage(conversationId: string, senderId: string, content: string, type = 'TEXT', mediaUrl?: string, replyToId?: string) {
    const message = await this.prisma.message.create({
      data: { conversationId, senderId, content, type: type as any, mediaUrl, replyToId },
      include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    return message;
  }

  async createDM(userId: string, targetUserId: string) {
    // Check if DM already exists
    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: 'DM',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: targetUserId } } },
        ],
      },
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        type: 'DM',
        members: { create: [{ userId, role: 'MEMBER' }, { userId: targetUserId, role: 'MEMBER' }] },
      },
      include: { members: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } } },
    });
  }

  async createGroup(userId: string, name: string, memberIds: string[]) {
    return this.prisma.conversation.create({
      data: {
        type: 'GROUP', name,
        members: { create: [{ userId, role: 'ADMIN' }, ...memberIds.map(id => ({ userId: id, role: 'MEMBER' as any }))] },
      },
      include: { members: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } } },
    });
  }

  async markRead(conversationId: string, userId: string) {
    return this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });
  }
}

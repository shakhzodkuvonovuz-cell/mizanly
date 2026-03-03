import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

const CONVERSATION_SELECT = {
  id: true,
  isGroup: true,
  groupName: true,
  groupAvatarUrl: true,
  lastMessageText: true,
  lastMessageAt: true,
  createdAt: true,
  members: {
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isVerified: true,
        },
      },
    },
  },
};

const MESSAGE_SELECT = {
  id: true,
  content: true,
  messageType: true,
  mediaUrl: true,
  mediaType: true,
  voiceDuration: true,
  fileName: true,
  fileSize: true,
  replyToId: true,
  isForwarded: true,
  isDeleted: true,
  editedAt: true,
  createdAt: true,
  sender: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  replyTo: {
    select: {
      id: true,
      content: true,
      senderId: true,
      sender: { select: { username: true } },
    },
  },
  reactions: {
    select: { id: true, emoji: true, userId: true },
  },
};

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async getConversations(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: { select: CONVERSATION_SELECT },
      },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
    });

    return memberships.map((m) => ({
      ...m.conversation,
      isMuted: m.isMuted,
      isArchived: m.isArchived,
      unreadCount: m.unreadCount,
      lastReadAt: m.lastReadAt,
    }));
  }

  async getConversation(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId);
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: CONVERSATION_SELECT,
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    return convo;
  }

  async getMessages(
    conversationId: string,
    userId: string,
    cursor?: string,
    limit = 50,
  ) {
    await this.requireMembership(conversationId, userId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId, isDeleted: false },
      select: MESSAGE_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;
    return {
      data: items,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    data: {
      content?: string;
      messageType?: string;
      mediaUrl?: string;
      mediaType?: string;
      replyToId?: string;
    },
  ) {
    await this.requireMembership(conversationId, senderId);

    if (!data.content && !data.mediaUrl) {
      throw new BadRequestException('Message must have content or media');
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: data.content,
        messageType: (data.messageType as any) ?? 'TEXT',
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        replyToId: data.replyToId,
      },
      select: MESSAGE_SELECT,
    });

    // Update conversation preview + increment unread for other members
    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessageText: data.content?.slice(0, 100) ?? null,
          lastMessageById: senderId,
        },
      }),
      this.prisma.conversationMember.updateMany({
        where: { conversationId, userId: { not: senderId } },
        data: { unreadCount: { increment: 1 } },
      }),
    ]);

    return message;
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) throw new ForbiddenException();

    await this.prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, content: null },
    });
    return { deleted: true };
  }

  async createDM(userId: string, targetUserId: string) {
    if (userId === targetUserId) throw new BadRequestException('Cannot DM yourself');

    // Check if DM already exists
    const existing = await this.prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: targetUserId } } },
        ],
      },
      select: CONVERSATION_SELECT,
    });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        isGroup: false,
        createdById: userId,
        members: {
          create: [{ userId }, { userId: targetUserId }],
        },
      },
      select: CONVERSATION_SELECT,
    });
  }

  async createGroup(userId: string, groupName: string, memberIds: string[]) {
    if (!groupName?.trim()) throw new BadRequestException('Group name is required');

    const allMemberIds = Array.from(new Set([userId, ...memberIds]));

    return this.prisma.conversation.create({
      data: {
        isGroup: true,
        groupName,
        createdById: userId,
        members: {
          create: allMemberIds.map((id) => ({ userId: id })),
        },
      },
      select: CONVERSATION_SELECT,
    });
  }

  async updateGroup(
    conversationId: string,
    userId: string,
    data: { groupName?: string; groupAvatarUrl?: string },
  ) {
    const convo = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!convo) throw new NotFoundException('Conversation not found');
    if (!convo.isGroup) throw new BadRequestException('Not a group');
    if (convo.createdById !== userId) throw new ForbiddenException('Only group creator can update');

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data,
      select: CONVERSATION_SELECT,
    });
  }

  async addGroupMembers(conversationId: string, userId: string, memberIds: string[]) {
    const convo = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!convo || !convo.isGroup) throw new NotFoundException('Group not found');
    if (convo.createdById !== userId) throw new ForbiddenException('Only group creator can add members');

    await this.prisma.conversationMember.createMany({
      data: memberIds.map((id) => ({ conversationId, userId: id })),
      skipDuplicates: true,
    });
    return { added: true };
  }

  async leaveGroup(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId);
    await this.prisma.conversationMember.delete({
      where: { conversationId_userId: { conversationId, userId } },
    });
    return { left: true };
  }

  async markRead(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date(), unreadCount: 0 },
    });
    return { read: true };
  }

  async muteConversation(conversationId: string, userId: string, muted: boolean) {
    await this.requireMembership(conversationId, userId);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isMuted: muted },
    });
    return { muted };
  }

  async archiveConversation(conversationId: string, userId: string, archived: boolean) {
    await this.requireMembership(conversationId, userId);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isArchived: archived },
    });
    return { archived };
  }

  async reactToMessage(messageId: string, userId: string, emoji: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.isDeleted) throw new NotFoundException('Message not found');
    await this.requireMembership(message.conversationId, userId);

    await this.prisma.messageReaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      create: { messageId, userId, emoji },
      update: {},
    });
    return { reacted: true };
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    await this.prisma.messageReaction.deleteMany({
      where: { messageId, userId, emoji },
    });
    return { removed: true };
  }

  async requireMembership(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this conversation');
    return member;
  }
}

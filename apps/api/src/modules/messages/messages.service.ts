import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PushTriggerService } from '../notifications/push-trigger.service';
import { AiService } from '../ai/ai.service';
import { MessageType } from '@prisma/client';
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const LOCK_KEY_LENGTH = 64;

const CONVERSATION_SELECT = {
  id: true,
  isGroup: true,
  createdById: true,
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
  senderId: true,
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
  isSpoiler: true,
  isViewOnce: true,
  viewedAt: true,
  isPinned: true,
  isScheduled: true,
  scheduledAt: true,
  isEncrypted: true,
  forwardCount: true,
  editedAt: true,
  deliveredAt: true,
  transcription: true,
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
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private prisma: PrismaService,
    private pushTrigger: PushTriggerService,
    private ai: AiService,
  ) {}

  async getConversations(userId: string, limit = 50) {
    limit = Math.min(Math.max(limit, 1), 100);
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: { select: CONVERSATION_SELECT },
      },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
      take: limit,
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
    const membership = await this.requireMembership(conversationId, userId);
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: CONVERSATION_SELECT,
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    return { ...convo, isMuted: membership.isMuted, isArchived: membership.isArchived };
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
      isSpoiler?: boolean;
      isViewOnce?: boolean;
    },
  ) {
    await this.requireMembership(conversationId, senderId);

    // Check if sender is blocked by any member in this conversation
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: senderId } },
      select: { userId: true },
      take: 200,
    });
    const otherUserIds = members.map(m => m.userId);
    if (otherUserIds.length > 0) {
      const blockExists = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: senderId, blockedId: { in: otherUserIds } },
            { blockedId: senderId, blockerId: { in: otherUserIds } },
          ],
        },
      });
      if (blockExists) {
        throw new ForbiddenException('Cannot send messages due to a block');
      }
    }

    if (!data.content && !data.mediaUrl) {
      throw new BadRequestException('Message must have content or media');
    }

    // Fetch conversation settings for slow mode and disappearing messages
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { slowModeSeconds: true, disappearingDuration: true },
    });
    if (convo?.slowModeSeconds && convo.slowModeSeconds > 0) {
      const lastMsg = await this.prisma.message.findFirst({
        where: { conversationId, senderId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (lastMsg) {
        const elapsed = (Date.now() - lastMsg.createdAt.getTime()) / 1000;
        if (elapsed < convo.slowModeSeconds) {
          throw new BadRequestException(`Slow mode: wait ${Math.ceil(convo.slowModeSeconds - elapsed)} seconds`);
        }
      }
    }

    // Atomic: message create + conversation update + unread increment
    const message = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId,
          content: data.content,
          messageType: (data.messageType as MessageType) ?? 'TEXT', // Validated by SendMessageDto @IsEnum
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          replyToId: data.replyToId,
          isSpoiler: data.isSpoiler ?? false,
          isViewOnce: data.isViewOnce ?? false,
          ...(convo?.disappearingDuration ? { expiresAt: new Date(Date.now() + convo.disappearingDuration * 1000) } : {}),
        },
        select: MESSAGE_SELECT,
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessageText: data.content?.slice(0, 100) ?? null,
          lastMessageById: senderId,
        },
      });

      await tx.conversationMember.updateMany({
        where: { conversationId, userId: { not: senderId } },
        data: { unreadCount: { increment: 1 } },
      });

      return msg;
    });

    // Trigger voice message transcription asynchronously
    if (
      message.messageType === 'VOICE' &&
      message.mediaUrl &&
      message.id
    ) {
      this.ai.transcribeVoiceMessage(message.id, message.mediaUrl).catch((err) => {
        this.logger.warn(`Voice transcription failed for message ${message.id}: ${err?.message}`);
      });
    }

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

  async editMessage(messageId: string, userId: string, content: string) {
    if (!content || content.trim().length === 0) throw new BadRequestException('Message content cannot be empty');
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) throw new ForbiddenException();
    if (message.isDeleted) throw new BadRequestException('Cannot edit deleted message');

    // Check if message is older than 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (message.createdAt < fifteenMinutesAgo) {
      throw new BadRequestException('Message can only be edited within 15 minutes');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      select: MESSAGE_SELECT,
    });
    return { message: updated };
  }


  async createDM(userId: string, targetUserId: string) {
    if (userId === targetUserId) throw new BadRequestException('Cannot DM yourself');

    // Verify target user exists
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');

    // Check if either user has blocked the other
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: userId },
        ],
      },
    });
    if (block) throw new ForbiddenException('Cannot message this user');

    // Atomic: check + create to prevent duplicate DMs from concurrent calls
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findFirst({
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

      return tx.conversation.create({
        data: {
          isGroup: false,
          createdById: userId,
          members: {
            create: [{ userId }, { userId: targetUserId }],
          },
        },
        select: CONVERSATION_SELECT,
      });
    });
  }

  async createGroup(userId: string, groupName: string, memberIds: string[]) {
    if (!groupName?.trim()) throw new BadRequestException('Group name is required');

    const allMemberIds = Array.from(new Set([userId, ...memberIds]));

    // Validate all member IDs correspond to real users
    const existingUsers = await this.prisma.user.findMany({
      where: { id: { in: allMemberIds } },
      select: { id: true },
      take: 50,
    });
    const existingIds = new Set(existingUsers.map((u) => u.id));
    const invalidIds = allMemberIds.filter((id) => !existingIds.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(`Invalid user IDs: ${invalidIds.join(', ')}`);
    }

    // Check blocks between creator and any member
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: userId, blockedId: { in: memberIds } },
          { blockedId: userId, blockerId: { in: memberIds } },
        ],
      },
      select: { blockerId: true, blockedId: true },
      take: 5000,
    });
    if (blocks.length > 0) {
      throw new BadRequestException('Cannot create group with blocked users');
    }

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

    // Validate member IDs exist
    const existingUsers = await this.prisma.user.findMany({
      where: { id: { in: memberIds } },
      select: { id: true },
      take: 200,
    });
    const existingIds = new Set(existingUsers.map(u => u.id));
    const invalidIds = memberIds.filter(id => !existingIds.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(`Invalid user IDs: ${invalidIds.join(', ')}`);
    }

    // Check blocks
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: userId, blockedId: { in: memberIds } },
          { blockedId: userId, blockerId: { in: memberIds } },
        ],
      },
      take: 5000,
    });
    if (blocks.length > 0) throw new BadRequestException('Cannot add blocked users');

    await this.prisma.conversationMember.createMany({
      data: memberIds.map((id) => ({ conversationId, userId: id })),
      skipDuplicates: true,
    });
    return { added: true };
  }

  async removeGroupMember(conversationId: string, userId: string, targetUserId: string) {
    const convo = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!convo || !convo.isGroup) throw new NotFoundException('Group not found');
    if (convo.createdById !== userId) throw new ForbiddenException('Only group creator can remove members');
    await this.prisma.conversationMember.delete({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
    });
    // Return targetUserId so controller/gateway can evict from socket room
    return { removed: true, conversationId, targetUserId };
  }

  async setLockCode(conversationId: string, userId: string, code: string | null) {
    await this.requireMembership(conversationId, userId);
    let hashedCode: string | null = null;
    if (code) {
      const salt = randomBytes(16).toString('hex');
      const derived = (await scryptAsync(code, salt, LOCK_KEY_LENGTH)) as Buffer;
      hashedCode = `${salt}:${derived.toString('hex')}`;
    }
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lockCode: hashedCode },
    });
    return { updated: true };
  }

  async verifyLockCode(conversationId: string, userId: string, code: string) {
    await this.requireMembership(conversationId, userId);
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { lockCode: true },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    if (!convo.lockCode) return { valid: false };
    const [salt, hash] = convo.lockCode.split(':');
    const derived = (await scryptAsync(code, salt, LOCK_KEY_LENGTH)) as Buffer;
    const storedBuf = Buffer.from(hash, 'hex');
    return { valid: timingSafeEqual(derived, storedBuf) };
  }

  async setNewMemberHistoryCount(conversationId: string, userId: string, count: number) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { createdById: true, isGroup: true },
    });
    if (!convo?.isGroup) throw new BadRequestException('Not a group');
    if (convo.createdById !== userId) throw new ForbiddenException('Only group owner can set this');
    const clampedCount = Math.max(0, Math.min(100, count));
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { newMemberHistoryCount: clampedCount },
    });
    return { count: clampedCount };
  }

  async setMemberTag(conversationId: string, userId: string, tag: string | null) {
    await this.requireMembership(conversationId, userId);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { tag: tag ? tag.slice(0, 30) : null },
    });
    return { updated: true };
  }

  async leaveGroup(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId);

    const convo = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!convo) throw new NotFoundException('Conversation not found');
    if (convo.createdById === userId) {
      throw new BadRequestException('Group owner cannot leave. Transfer ownership first.');
    }

    await this.prisma.conversationMember.delete({
      where: { conversationId_userId: { conversationId, userId } },
    });
    return { left: true, conversationId, userId };
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
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    await this.requireMembership(message.conversationId, userId);
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
    if (member.isBanned) throw new ForbiddenException('You are banned from this conversation');
    return member;
  }

  async searchMessages(conversationId: string, userId: string, query: string, cursor?: string, limit = 20) {
    if (!query?.trim()) throw new BadRequestException('Search query is required');
    await this.requireMembership(conversationId, userId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId, isDeleted: false, content: { contains: query, mode: 'insensitive' }, ...(cursor ? { id: { lt: cursor } } : {}) },
      include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();
    return { data: messages, meta: { cursor: messages[messages.length - 1]?.id ?? null, hasMore } };
  }

  async forwardMessage(messageId: string, userId: string, targetConversationIds: string[]) {
    const MAX_FORWARD_TARGETS = 5;
    if (targetConversationIds.length > MAX_FORWARD_TARGETS) {
      throw new BadRequestException(`You can forward to a maximum of ${MAX_FORWARD_TARGETS} chats at once`);
    }
    if (targetConversationIds.length === 0) {
      throw new BadRequestException('No target conversations provided');
    }

    const original = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        conversationId: true, content: true, messageType: true, mediaUrl: true,
        mediaType: true, voiceDuration: true, fileName: true, fileSize: true,
        forwardCount: true, isViewOnce: true,
      },
    });
    if (!original) throw new NotFoundException('Message not found');
    if (original.isViewOnce) throw new BadRequestException('View-once messages cannot be forwarded');
    await this.requireMembership(original.conversationId, userId);

    const results = [];
    for (const convId of targetConversationIds) {
      await this.requireMembership(convId, userId);
      const msg = await this.prisma.message.create({
        data: {
          conversationId: convId, senderId: userId,
          content: original.content, messageType: original.messageType,
          mediaUrl: original.mediaUrl, mediaType: original.mediaType,
          voiceDuration: original.voiceDuration, fileName: original.fileName,
          fileSize: original.fileSize,
          isForwarded: true, forwardedFromId: messageId,
        },
      });
      results.push(msg);
      await this.prisma.conversation.update({
        where: { id: convId },
        data: { lastMessageText: original.content ?? '[Forwarded]', lastMessageAt: new Date(), lastMessageById: userId },
      });
    }

    // Increment forward count on original message
    await this.prisma.message.update({
      where: { id: messageId },
      data: { forwardCount: { increment: targetConversationIds.length } },
    });

    return results;
  }

  async markDelivered(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    await this.requireMembership(message.conversationId, userId);
    // Only set deliveredAt if not already set (idempotent)
    if (!message.deliveredAt) {
      return this.prisma.message.update({ where: { id: messageId }, data: { deliveredAt: new Date() } });
    }
    return message;
  }

  async getMediaGallery(conversationId: string, userId: string, cursor?: string, limit = 30) {
    await this.requireMembership(conversationId, userId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId, isDeleted: false, messageType: { in: ['IMAGE', 'VIDEO'] }, ...(cursor ? { id: { lt: cursor } } : {}) },
      select: { id: true, mediaUrl: true, mediaType: true, messageType: true, createdAt: true, senderId: true },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();
    return { data: messages, meta: { cursor: messages[messages.length - 1]?.id ?? null, hasMore } };
  }

  async setDisappearingTimer(conversationId: string, userId: string, duration: number | null) {
    await this.requireMembership(conversationId, userId);
    // Validate duration: null or positive integer (seconds)
    if (duration !== null && (duration <= 0 || !Number.isInteger(duration))) {
      throw new BadRequestException('Duration must be null or a positive integer in seconds');
    }
    // Update conversation with disappearingDuration (field must exist in schema)
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { disappearingDuration: duration },
    });
    return { success: true, duration };
  }

  async archiveConversationForUser(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isArchived: true },
    });
    return { archived: true };
  }

  async unarchiveConversationForUser(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isArchived: false },
    });
    return { archived: false };
  }

  async getArchivedConversations(userId: string, cursor?: string, limit = 20) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, isArchived: true },
      select: {
        conversation: { select: CONVERSATION_SELECT },
        isMuted: true,
        isArchived: true,
        unreadCount: true,
        lastReadAt: true,
        conversationId: true,
      },
      take: limit + 1,
      ...(cursor ? { cursor: { conversationId_userId: { conversationId: cursor, userId } }, skip: 1 } : {}),
      orderBy: { conversation: { lastMessageAt: 'desc' } },
    });
    const hasMore = memberships.length > limit;
    const data = hasMore ? memberships.slice(0, limit) : memberships;
    const items = data.map((m) => ({
      ...m.conversation,
      isMuted: m.isMuted,
      isArchived: m.isArchived,
      unreadCount: m.unreadCount,
      lastReadAt: m.lastReadAt,
    }));
    return {
      data: items,
      meta: { cursor: hasMore ? data[data.length - 1].conversationId : null, hasMore },
    };
  }

  async scheduleMessage(
    conversationId: string,
    userId: string,
    content: string,
    scheduledAt: Date,
    messageType?: string,
  ) {
    await this.requireMembership(conversationId, userId);
    if (!content?.trim()) {
      throw new BadRequestException('Message content is required');
    }
    if (scheduledAt <= new Date()) {
      throw new BadRequestException('Scheduled time must be in the future');
    }
    // Create message with isScheduled flag (field must exist in schema)
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        content,
        messageType: (messageType as MessageType) ?? 'TEXT', // Validated by ScheduleMessageDto @IsEnum
        isScheduled: true,
        scheduledAt,
      },
      select: MESSAGE_SELECT,
    });
    return message;
  }

  async getStarredMessages(userId: string, cursor?: string, limit = 20) {
    // starredBy field must exist in Message model
    const messages = await this.prisma.message.findMany({
      where: {
        isDeleted: false,
        starredBy: { has: userId },
      },
      select: MESSAGE_SELECT,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    const hasMore = messages.length > limit;
    const data = hasMore ? messages.slice(0, limit) : messages;
    return {
      data,
      meta: { cursor: hasMore ? data[data.length - 1].id : null, hasMore },
    };
  }

  // ── Pin Messages ──
  async pinMessage(conversationId: string, messageId: string, userId: string) {
    await this.requireMembership(conversationId, userId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.conversationId !== conversationId) {
      throw new BadRequestException('Message does not belong to this conversation');
    }

    // Max 3 pinned per conversation
    const pinnedCount = await this.prisma.message.count({
      where: { conversationId, isPinned: true, isDeleted: false },
    });
    if (pinnedCount >= 3) {
      throw new BadRequestException('Maximum 3 pinned messages per conversation');
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { isPinned: true, pinnedAt: new Date(), pinnedById: userId },
    });
  }

  async unpinMessage(conversationId: string, messageId: string, userId: string) {
    await this.requireMembership(conversationId, userId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.conversationId !== conversationId) {
      throw new BadRequestException('Message does not belong to this conversation');
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { isPinned: false, pinnedAt: null, pinnedById: null },
    });
  }

  async getPinnedMessages(conversationId: string, userId: string) {
    await this.requireMembership(conversationId, userId);
    return this.prisma.message.findMany({
      where: { conversationId, isPinned: true, isDeleted: false },
      select: MESSAGE_SELECT,
      orderBy: { pinnedAt: 'desc' },
      take: 50,
    });
  }

  // ── View Once ──
  async sendViewOnceMessage(
    conversationId: string,
    senderId: string,
    data: { content?: string; mediaUrl: string; mediaType?: string; messageType?: string },
  ) {
    await this.requireMembership(conversationId, senderId);
    return this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: data.content,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        messageType: (data.messageType as MessageType) ?? 'IMAGE',
        isViewOnce: true,
      },
      select: MESSAGE_SELECT,
    });
  }

  async markViewOnceViewed(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true, senderId: true, isViewOnce: true, viewedAt: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (!message.isViewOnce) throw new BadRequestException('Not a view-once message');
    if (message.senderId === userId) throw new BadRequestException('Cannot view own view-once message');
    if (message.viewedAt) throw new BadRequestException('Already viewed');

    await this.requireMembership(message.conversationId, userId);

    return this.prisma.message.update({
      where: { id: messageId },
      data: { viewedAt: new Date() },
    });
  }

  // ── Group Admin Roles ──
  async promoteToAdmin(conversationId: string, userId: string, targetUserId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member || member.role !== 'owner') {
      throw new ForbiddenException('Only the group owner can promote members to admin');
    }
    return this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
      data: { role: 'admin' },
    });
  }

  async demoteFromAdmin(conversationId: string, userId: string, targetUserId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member || member.role !== 'owner') {
      throw new ForbiddenException('Only owner can demote admins');
    }
    return this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
      data: { role: 'member' },
    });
  }

  async banMember(conversationId: string, userId: string, targetUserId: string) {
    const actor = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
      throw new ForbiddenException('Only owner or admin can ban members');
    }
    const target = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'owner') throw new ForbiddenException('Cannot ban the owner');

    return this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
      data: { isBanned: true },
    });
  }

  async setConversationWallpaper(conversationId: string, userId: string, wallpaperUrl: string | null) {
    await this.requireMembership(conversationId, userId);
    return this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { wallpaperUrl },
    });
  }

  async setCustomTone(conversationId: string, userId: string, tone: string | null) {
    await this.requireMembership(conversationId, userId);
    return this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { customTone: tone },
    });
  }

  // ── DM Notes ──
  async createDMNote(userId: string, content: string, expiresInHours = 24) {
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    return this.prisma.dMNote.upsert({
      where: { userId },
      create: { userId, content, expiresAt },
      update: { content, expiresAt },
    });
  }

  async getDMNote(userId: string) {
    const note = await this.prisma.dMNote.findUnique({ where: { userId } });
    if (!note || note.expiresAt < new Date()) return null;
    return note;
  }

  async deleteDMNote(userId: string) {
    const note = await this.prisma.dMNote.findUnique({ where: { userId } });
    if (!note) throw new NotFoundException('Note not found');
    await this.prisma.dMNote.delete({ where: { userId } });
    return { deleted: true };
  }

  async getDMNotesForContacts(userId: string) {
    // Get user IDs from conversations
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
      take: 50,
    });
    const convIds = memberships.map((m) => m.conversationId);
    const otherMembers = await this.prisma.conversationMember.findMany({
      where: { conversationId: { in: convIds }, userId: { not: userId } },
      select: { userId: true },
      take: 50,
    });
    const contactIds = [...new Set(otherMembers.map((m) => m.userId))];

    return this.prisma.dMNote.findMany({
      where: {
        userId: { in: contactIds },
        expiresAt: { gt: new Date() },
      },
      take: 50,
    });
  }

  // ── Message Expiry Job ──
  async processExpiredMessages() {
    const now = new Date();
    // Delete expired disappearing messages
    await this.prisma.message.updateMany({
      where: { expiresAt: { lt: now }, isDeleted: false },
      data: { isDeleted: true, content: null, mediaUrl: null },
    });
    // Delete viewed view-once messages older than 30 seconds
    const thirtySecondsAgo = new Date(now.getTime() - 30000);
    await this.prisma.message.updateMany({
      where: { isViewOnce: true, viewedAt: { lt: thirtySecondsAgo }, isDeleted: false },
      data: { isDeleted: true, content: null, mediaUrl: null },
    });
  }
}

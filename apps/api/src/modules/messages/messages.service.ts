import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import Redis from 'ioredis';
import { PrismaService } from '../../config/prisma.service';
import { PushTriggerService } from '../notifications/push-trigger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AiService } from '../ai/ai.service';
import { ContentSafetyService } from '../moderation/content-safety.service';
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
  encryptedLastMessagePreview: true,
  createdAt: true,
  members: {
    select: {
      userId: true,
      role: true,
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
    take: 5, // Limit to first 5 members for conversation list display
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
  encryptedContent: true,
  e2eVersion: true,
  e2eSenderDeviceId: true,
  e2eSenderRatchetKey: true,
  e2eCounter: true,
  e2ePreviousCounter: true,
  e2eSenderKeyId: true,
  clientMessageId: true,
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
    take: 50,
  },
};

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private prisma: PrismaService,
    private pushTrigger: PushTriggerService,
    private notifications: NotificationsService,
    private ai: AiService,
    private contentSafety: ContentSafetyService,
    @Inject('REDIS') private redis: Redis,
  ) {}

  async getTotalUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const result = await this.prisma.conversationMember.aggregate({
      where: { userId },
      _sum: { unreadCount: true },
    });
    return { unreadCount: result._sum.unreadCount ?? 0 };
  }

  async getConversations(userId: string, limit = 50) {
    limit = Math.min(Math.max(limit, 1), 100);
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, isArchived: false, isBanned: false },
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

    // Finding #355: Filter out messages from users who blocked or are blocked by the viewer
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
      take: 10000, // CODEX #40: safety-critical — no cap on block enforcement
    });
    const blockedIds = blocks.map(b => b.blockerId === userId ? b.blockedId : b.blockerId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId, isDeleted: false, isScheduled: false, ...(blockedIds.length ? { senderId: { notIn: blockedIds } } : {}) },
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
    senderId: string | null,
    data: {
      content?: string;
      messageType?: string;
      mediaUrl?: string;
      mediaType?: string;
      replyToId?: string;
      isSpoiler?: boolean;
      isViewOnce?: boolean;
      // E2E encryption fields (opaque passthrough — server never reads content)
      encryptedContent?: Uint8Array;
      e2eVersion?: number;
      e2eSenderDeviceId?: number;
      e2eSenderRatchetKey?: Uint8Array;
      e2eCounter?: number;
      e2ePreviousCounter?: number;
      e2eSenderKeyId?: number;
      clientMessageId?: string;
      encryptedLastMessagePreview?: Uint8Array;
      // V6-F1b: Sealed sender — senderId is null, sender identity is inside encrypted envelope
      _sealedSender?: boolean;
      // Internal: skip Redis publish when called from WebSocket gateway (prevents double delivery)
      _skipRedisPublish?: boolean;
    },
  ) {
    // V6-F1b: Sealed sender fast path — senderId is null.
    // The gateway already verified: sender membership, recipient membership, rate limit.
    // Skip all sender-specific checks (block, DM restriction, slow mode).
    // Only persist the opaque encrypted payload with senderId=null.
    if (data._sealedSender && senderId === null) {
      if (!data.encryptedContent) {
        throw new BadRequestException('Sealed sender messages must have encryptedContent');
      }
      // Dedup for sealed sender: match by clientMessageId + conversationId only (no senderId)
      if (data.clientMessageId) {
        const existing = await this.prisma.message.findUnique({
          where: { clientMessageId: data.clientMessageId },
          select: { ...MESSAGE_SELECT, conversationId: true },
        });
        if (existing && existing.conversationId === conversationId) {
          return existing;
        }
      }
      // Fetch conversation for isE2E flag and disappearing duration
      const convo = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { isE2E: true, disappearingDuration: true },
      });
      return this.prisma.$transaction(async (tx) => {
        const msg = await tx.message.create({
          data: {
            conversationId,
            senderId: null, // V6-F1b: sender identity is inside the sealed envelope
            messageType: (data.messageType as MessageType) ?? 'TEXT',
            isEncrypted: true,
            encryptedContent: new Uint8Array(data.encryptedContent!),
            ...(data.e2eVersion ? { e2eVersion: data.e2eVersion } : {}),
            ...(data.e2eSenderDeviceId !== undefined ? { e2eSenderDeviceId: data.e2eSenderDeviceId } : {}),
            ...(data.e2eSenderRatchetKey ? { e2eSenderRatchetKey: new Uint8Array(data.e2eSenderRatchetKey) } : {}),
            ...(data.e2eCounter !== undefined ? { e2eCounter: data.e2eCounter } : {}),
            ...(data.e2ePreviousCounter !== undefined ? { e2ePreviousCounter: data.e2ePreviousCounter } : {}),
            ...(data.e2eSenderKeyId !== undefined ? { e2eSenderKeyId: data.e2eSenderKeyId } : {}),
            ...(data.clientMessageId ? { clientMessageId: data.clientMessageId } : {}),
            ...(convo?.disappearingDuration ? { expiresAt: new Date(Date.now() + convo.disappearingDuration * 1000) } : {}),
          },
          select: MESSAGE_SELECT,
        });
        await tx.conversation.update({
          where: { id: conversationId },
          data: {
            lastMessageAt: new Date(),
            lastMessageText: null, // Sealed sender — no plaintext preview
            lastMessageById: null, // V6-F1b: sender unknown to server
            ...(!convo?.isE2E ? { isE2E: true } : {}),
          },
        });
        return msg;
      });
    }

    // From here on, senderId is required (non-sealed path).
    // The sealed sender path above returns early with senderId=null.
    if (!senderId) {
      throw new BadRequestException('senderId is required for non-sealed messages');
    }

    // Idempotent dedup: if clientMessageId already exists AND belongs to this conversation+sender,
    // return the existing message. Check conversation+sender to prevent cross-conversation info leak.
    if (data.clientMessageId) {
      const existing = await this.prisma.message.findUnique({
        where: { clientMessageId: data.clientMessageId },
        select: { ...MESSAGE_SELECT, conversationId: true },
      });
      if (existing && existing.conversationId === conversationId && existing.senderId === senderId) {
        return existing;
      }
      // If clientMessageId exists for a different conversation/sender, silently ignore.
      // Returning a specific error would confirm message existence (information leak).
      // The Prisma unique constraint will catch the actual collision on insert.
    }

    // Single combined query: membership check + conversation data + other members
    // Replaces 3 separate queries (requireMembership, findMany members, findUnique conversation)
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: senderId } },
      select: {
        isBanned: true,
        conversation: {
          select: {
            isGroup: true,
            slowModeSeconds: true,
            disappearingDuration: true,
            isE2E: true, // V6-F2b: persistent E2E enforcement flag
            members: { where: { userId: { not: senderId } }, select: { userId: true }, take: 200 },
          },
        },
      },
    });
    if (!membership) throw new ForbiddenException('Not a member of this conversation');
    if (membership.isBanned) throw new ForbiddenException('You are banned from this conversation');

    const convo = membership.conversation;
    const otherUserIds = convo.members.map(m => m.userId);

    // Check if sender is blocked by any member
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

    // DM restriction: prevent non-followers from messaging private accounts (1:1 only)
    // Parallelize independent queries (J01-#12): follow check + privacy settings + isPrivate in one round-trip
    if (convo && !convo.isGroup) {
      const otherMemberId = otherUserIds.length === 1 ? otherUserIds[0] : undefined;
      if (otherMemberId) {
        const [isFollowing, recipientPrivacy, recipientUser] = await Promise.all([
          this.prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: senderId, followingId: otherMemberId } },
            select: { followerId: true },
          }),
          this.prisma.userSettings.findUnique({
            where: { userId: otherMemberId },
            select: { messagePermission: true },
          }),
          this.prisma.user.findUnique({
            where: { id: otherMemberId },
            select: { isPrivate: true },
          }),
        ]);
        const msgPerm = recipientPrivacy?.messagePermission || 'everyone';
        if (msgPerm === 'nobody') {
          throw new ForbiddenException('This user has disabled direct messages');
        }
        if (msgPerm === 'followers' && !isFollowing) {
          throw new ForbiddenException('This user only accepts messages from followers');
        }
        if (!isFollowing && recipientUser?.isPrivate) {
          throw new ForbiddenException('This user only accepts messages from followers');
        }
      }
    }

    // Validate: message must have plaintext content, encrypted content, or media
    if (!data.content && !data.encryptedContent && !data.mediaUrl) {
      throw new BadRequestException('Message must have content, encrypted content, or media');
    }

    // CRITICAL E2E validation — prevent plaintext leakage via malicious clients:
    // 1. If e2eVersion is set, encryptedContent is REQUIRED
    if (data.e2eVersion && !data.encryptedContent) {
      throw new BadRequestException('e2eVersion requires encryptedContent');
    }
    // 2. If encryptedContent is set, e2eVersion is REQUIRED (prevent ghost blobs)
    if (data.encryptedContent && !data.e2eVersion) {
      throw new BadRequestException('encryptedContent requires e2eVersion');
    }
    // 3. Plaintext content and encrypted content are MUTUALLY EXCLUSIVE
    //    A message is either plaintext OR encrypted, never both.
    //    Without this, a malicious client could send plaintext alongside encrypted
    //    content, leaking the message to the server while appearing "encrypted."
    if (data.content && data.encryptedContent) {
      throw new BadRequestException('Message cannot have both content and encryptedContent');
    }
    // V6-F2b: Persistent E2E enforcement — once a conversation has received an encrypted
    // message, ALL subsequent messages MUST be encrypted. A compromised server cannot
    // inject plaintext content into E2E conversations. This replaces the Redis TTL check
    // in the gateway (which expired after 24h, creating a delayed injection window).
    if (convo?.isE2E && !data.encryptedContent) {
      throw new BadRequestException('This conversation requires end-to-end encryption');
    }

    // Slow mode check (using convo from merged query above)
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
          content: data.e2eVersion ? null : data.content, // Null for encrypted (content in encryptedContent)
          messageType: (data.messageType as MessageType) ?? 'TEXT',
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          replyToId: data.replyToId,
          isSpoiler: data.isSpoiler ?? false,
          isViewOnce: data.isViewOnce ?? false,
          isEncrypted: !!data.e2eVersion,
          // E2E fields (opaque passthrough)
          ...(data.encryptedContent ? { encryptedContent: new Uint8Array(data.encryptedContent) } : {}),
          ...(data.e2eVersion ? { e2eVersion: data.e2eVersion } : {}),
          ...(data.e2eSenderDeviceId !== undefined ? { e2eSenderDeviceId: data.e2eSenderDeviceId } : {}),
          ...(data.e2eSenderRatchetKey ? { e2eSenderRatchetKey: new Uint8Array(data.e2eSenderRatchetKey) } : {}),
          ...(data.e2eCounter !== undefined ? { e2eCounter: data.e2eCounter } : {}),
          ...(data.e2ePreviousCounter !== undefined ? { e2ePreviousCounter: data.e2ePreviousCounter } : {}),
          ...(data.e2eSenderKeyId !== undefined ? { e2eSenderKeyId: data.e2eSenderKeyId } : {}),
          ...(data.clientMessageId ? { clientMessageId: data.clientMessageId } : {}),
          ...(convo?.disappearingDuration ? { expiresAt: new Date(Date.now() + convo.disappearingDuration * 1000) } : {}),
        },
        select: MESSAGE_SELECT,
      });

      const now = new Date();
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: now,
          // Encrypted messages: no plaintext preview, use encryptedLastMessagePreview
          lastMessageText: data.e2eVersion ? null : (data.content?.slice(0, 100) ?? null),
          lastMessageById: senderId,
          // V6-F2b: Set isE2E=true on first encrypted message (never unset).
          // Once set, all future messages in this conversation MUST be encrypted.
          ...(data.e2eVersion && !convo?.isE2E ? { isE2E: true } : {}),
          ...(data.encryptedLastMessagePreview
            ? { encryptedLastMessagePreview: new Uint8Array(data.encryptedLastMessagePreview) }
            : {}),
        },
      });

      // Update sender's per-member lastMessageAt for conversation ordering
      await tx.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId: senderId } },
        data: { lastMessageAt: now },
      });

      await tx.conversationMember.updateMany({
        where: { conversationId, userId: { not: senderId } },
        data: { unreadCount: { increment: 1 }, lastMessageAt: now },
      });

      return msg;
    });

    // Trigger voice message transcription asynchronously
    // Skip for encrypted messages — server can't read the audio
    if (
      (message.messageType === 'VOICE') &&
      message.mediaUrl &&
      message.id &&
      !data.e2eVersion // Skip transcription for E2E encrypted voice messages
    ) {
      this.ai.transcribeVoiceMessage(message.id, message.mediaUrl).catch((err) => {
        this.logger.warn(`Voice transcription failed for message ${message.id}: ${err?.message}`);
      });
    }

    // Push notification strategy:
    // - Unencrypted: preview in push body (good UX, it's plaintext anyway)
    // - Encrypted: "New message" in body + encrypted preview in push data field.
    //   Android background handler decrypts data.encryptedPreview → shows local notification.
    //   iOS NSE does the same (post-launch, requires native extension).
    //
    // BOTH types have a non-empty body → Apple/Google can't distinguish by body presence.
    // The only difference is content vs generic text — same as any app that varies notification text.
    const notificationBody = data.e2eVersion
      ? 'New message'
      : (data.content
          ? (data.content.length > 100 ? data.content.slice(0, 99) + '…' : data.content)
          : 'New message');
    this.notifyConversationMembers(conversationId, senderId, notificationBody).catch((err) => {
      this.logger.warn(`Message notification failed: ${err?.message}`);
    });

    // Publish to Redis so ChatGateway can broadcast to socket room.
    // Only for REST-sent messages — WebSocket messages are broadcast directly by the gateway.
    // The gateway sets skipRedisPublish=true to prevent double delivery.
    if (!data._skipRedisPublish) {
      this.redis.publish('new_message', JSON.stringify({
        conversationId,
        message,
      })).catch((e) => this.logger.debug('Redis new_message publish failed', e));
    }

    return message;
  }

  /**
   * Notify all non-muted conversation members about a new message (except the sender).
   * Uses NotificationsService.create() for full pipeline (settings, block/mute, dedup, push, socket).
   */
  private async notifyConversationMembers(
    conversationId: string,
    senderId: string,
    content?: string,
  ): Promise<void> {
    const members = await this.prisma.conversationMember.findMany({
      where: {
        conversationId,
        userId: { not: senderId },
        isMuted: false,
      },
      select: { userId: true },
      take: 1024, // Match max group size
    });
    if (members.length === 0) return;

    const truncatedBody = content
      ? (content.length > 100 ? content.slice(0, 99) + '\u2026' : content)
      : 'Sent a message';

    // Process in batches of 20 to avoid overwhelming notification service
    const NOTIFY_BATCH = 20;
    for (let i = 0; i < members.length; i += NOTIFY_BATCH) {
      const batch = members.slice(i, i + NOTIFY_BATCH);
      await Promise.all(
        batch.map((member) =>
          this.notifications.create({
            userId: member.userId,
            actorId: senderId,
            type: 'MESSAGE',
            conversationId,
            body: truncatedBody,
            // E2E encrypted preview is stored on the Conversation model (encryptedLastMessagePreview).
            // The push notification handler on the client reads it from the cached conversation data.
          }).catch((err) => {
            this.logger.warn(`Notification to ${member.userId} failed: ${err?.message}`);
          }),
        ),
      );
    }
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, conversationId: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    // Verify membership in the conversation
    await this.requireMembership(message.conversationId, userId);
    if (message.senderId !== userId) throw new ForbiddenException();

    // Clear ALL content fields including E2E cryptographic material.
    // Ratchet keys in the DB could be combined with a compromised private key
    // to derive session keys for this specific message.
    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        content: null,
        encryptedContent: null,
        encNonce: null,
        e2eSenderRatchetKey: null,
        e2eVersion: null,
        e2eSenderDeviceId: null,
        e2eCounter: null,
        e2ePreviousCounter: null,
        e2eSenderKeyId: null,
        transcription: null,
        mediaUrl: null,
        fileName: null,
        voiceDuration: null,
        mediaType: null,
        fileSize: null,
      },
    });
    return { deleted: true };
  }

  async editMessage(messageId: string, userId: string, content: string) {
    if (!content || content.trim().length === 0) throw new BadRequestException('Message content cannot be empty');
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, isDeleted: true, createdAt: true, isEncrypted: true, e2eVersion: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) throw new ForbiddenException();
    if (message.isDeleted) throw new BadRequestException('Cannot edit deleted message');

    // CRITICAL: Encrypted messages CANNOT be edited via plaintext REST endpoint.
    // Allowing this would let a malicious client retroactively expose E2E message
    // content to the server in plaintext. Edits to encrypted messages must be
    // done client-side (decrypt → modify → re-encrypt → send as new encrypted message).
    if (message.isEncrypted || message.e2eVersion) {
      throw new BadRequestException(
        'Encrypted messages cannot be edited via server. ' +
        'Use client-side re-encryption.',
      );
    }

    // Check if message is older than 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (message.createdAt < fifteenMinutesAgo) {
      throw new BadRequestException('Message can only be edited within 15 minutes');
    }

    // X08-#7: Run content moderation on edited text to prevent bait-and-switch
    const modResult = await this.contentSafety.moderateText(content);
    if (!modResult.safe) {
      throw new BadRequestException('Message content flagged by moderation');
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
      take: 200,
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
      take: 10000,
    });
    if (blocks.length > 0) {
      throw new BadRequestException('Cannot create group with blocked users');
    }

    return this.prisma.$transaction(async (tx) => {
      const convo = await tx.conversation.create({
        data: {
          isGroup: true,
          groupName,
          createdById: userId,
          members: {
            create: allMemberIds.map((id) => ({
              userId: id,
              role: id === userId ? 'owner' : 'member',
            })),
          },
        },
        select: CONVERSATION_SELECT,
      });
      return convo;
    });
  }

  async updateGroup(
    conversationId: string,
    userId: string,
    data: { groupName?: string; groupAvatarUrl?: string; groupDescription?: string },
  ) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, isGroup: true, createdById: true },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    if (!convo.isGroup) throw new BadRequestException('Not a group');

    const member = await this.requireMembership(conversationId, userId);
    if (member.role !== 'admin' && member.role !== 'owner' && convo.createdById !== userId) {
      throw new ForbiddenException('Only admins can update group settings');
    }

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data,
      select: CONVERSATION_SELECT,
    });
  }

  async addGroupMembers(conversationId: string, userId: string, memberIds: string[]) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, isGroup: true, createdById: true },
    });
    if (!convo || !convo.isGroup) throw new NotFoundException('Group not found');
    if (convo.createdById !== userId) throw new ForbiddenException('Only group creator can add members');

    // Finding #219: Group size limit — max 1024 members
    const memberCount = await this.prisma.conversationMember.count({ where: { conversationId } });
    if (memberCount + memberIds.length > 1024) {
      throw new BadRequestException(`Group cannot exceed 1024 members (current: ${memberCount})`);
    }

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
      take: 10000,
    });
    if (blocks.length > 0) throw new BadRequestException('Cannot add blocked users');

    await this.prisma.conversationMember.createMany({
      data: memberIds.map((id) => ({ conversationId, userId: id })),
      skipDuplicates: true,
    });
    return { added: true };
  }

  async removeGroupMember(conversationId: string, userId: string, targetUserId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, isGroup: true, createdById: true },
    });
    if (!convo || !convo.isGroup) throw new NotFoundException('Group not found');
    if (convo.createdById !== userId) throw new ForbiddenException('Only group creator can remove members');
    await this.prisma.conversationMember.delete({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
    });
    // Return targetUserId so controller/gateway can evict from socket room
    return { removed: true, conversationId, targetUserId };
  }

  /**
   * Finding #167: Promote or demote a group member's role.
   */
  async changeGroupRole(conversationId: string, userId: string, targetUserId: string, role: 'admin' | 'member') {
    // Defense-in-depth: validate role at service level too (controller also validates)
    const allowedRoles = ['admin', 'member'];
    if (!allowedRoles.includes(role)) {
      throw new BadRequestException('Role must be "admin" or "member"');
    }
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, isGroup: true, createdById: true },
    });
    if (!convo || !convo.isGroup) throw new NotFoundException('Group not found');
    if (convo.createdById !== userId) throw new ForbiddenException('Only group creator can change roles');
    if (targetUserId === userId) throw new BadRequestException('Cannot change your own role');

    const target = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'owner') throw new ForbiddenException('Cannot change owner role');

    return this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
      data: { role },
    });
  }

  /**
   * Finding #169: Generate a shareable invite link for a group.
   */
  async generateGroupInviteLink(conversationId: string, userId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, isGroup: true, createdById: true },
    });
    if (!convo || !convo.isGroup) throw new NotFoundException('Group not found');
    const member = await this.requireMembership(conversationId, userId);

    // Only admins/owners/creator can generate invite links
    if (member.role !== 'admin' && member.role !== 'owner' && convo.createdById !== userId) {
      throw new ForbiddenException('Only admins can generate invite links');
    }

    // Use existing crypto import (randomBytes already imported at top of file)
    const inviteCode = randomBytes(16).toString('base64url');

    // Store in Redis (cache) with 7-day expiry + DB (durable) for recovery on flush
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await Promise.all([
      this.redis.setex(`group_invite:${inviteCode}`, 7 * 24 * 60 * 60, conversationId),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { inviteCode, inviteExpiresAt: expiresAt },
      }).catch((err) => {
        this.logger.warn(`Failed to persist invite code to DB for conversation ${conversationId}: ${err?.message}`);
      }),
    ]);

    return { inviteCode, expiresIn: '7 days' };
  }

  /**
   * Finding #169: Join a group via invite link.
   */
  async joinViaInviteLink(inviteCode: string, userId: string) {
    let conversationId = await this.redis.get(`group_invite:${inviteCode}`);
    // Fallback to DB if Redis lost the invite link
    if (!conversationId) {
      const convo = await this.prisma.conversation.findFirst({
        where: { inviteCode, inviteExpiresAt: { gt: new Date() } },
        select: { id: true, inviteExpiresAt: true },
      });
      if (convo) {
        conversationId = convo.id;
        // Re-seed Redis cache with remaining TTL
        const ttl = Math.max(1, Math.floor((convo.inviteExpiresAt!.getTime() - Date.now()) / 1000));
        await this.redis.setex(`group_invite:${inviteCode}`, ttl, conversationId).catch(() => {});
      }
    }
    if (!conversationId) throw new NotFoundException('Invite link expired or invalid');

    const existing = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    // Check if user was banned from this group
    if (existing?.isBanned) {
      throw new ForbiddenException('You are banned from this group');
    }
    if (existing) throw new ConflictException('Already a member of this group');

    await this.prisma.conversationMember.create({
      data: { conversationId, userId, role: 'member' },
    });

    return { joined: true, conversationId };
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

  /**
   * Finding #310: Global message search across all user's conversations.
   */
  async searchAllMessages(userId: string, query: string, limit = 20) {
    if (!query.trim()) throw new BadRequestException('Search query required');

    // Get all conversation IDs the user is a member of
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
      take: 200,
    });
    const convIds = memberships.map(m => m.conversationId);
    if (convIds.length === 0) return [];

    return this.prisma.message.findMany({
      where: {
        conversationId: { in: convIds },
        isDeleted: false,
        e2eVersion: null, // Exclude encrypted messages — server can't search ciphertext
        content: { contains: query.trim(), mode: 'insensitive' },
      },
      select: {
        id: true, content: true, conversationId: true, createdAt: true,
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async searchMessages(conversationId: string, userId: string, query: string, cursor?: string, limit = 20) {
    if (!query?.trim()) throw new BadRequestException('Search query is required');
    await this.requireMembership(conversationId, userId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId, isDeleted: false, e2eVersion: null, content: { contains: query, mode: 'insensitive' }, ...(cursor ? { id: { lt: cursor } } : {}) },
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
        forwardCount: true, isViewOnce: true, isEncrypted: true, e2eVersion: true,
      },
    });
    if (!original) throw new NotFoundException('Message not found');
    if (original.isViewOnce) throw new BadRequestException('View-once messages cannot be forwarded');
    if (original.e2eVersion) throw new BadRequestException('Encrypted messages cannot be forwarded by the server. Use client-side forwarding (decrypt → re-encrypt for target).');
    await this.requireMembership(original.conversationId, userId);

    // Batch: verify all memberships at once (single query instead of N)
    const memberships = await this.prisma.conversationMember.findMany({
      where: { conversationId: { in: targetConversationIds }, userId },
      select: { conversationId: true, isBanned: true },
    });
    const memberConvIds = new Set(memberships.filter(m => !m.isBanned).map(m => m.conversationId));
    const validTargets = targetConversationIds.filter(id => memberConvIds.has(id));
    if (validTargets.length === 0) throw new ForbiddenException('Not a member of any target conversation');

    // Batch: get all other members across all target conversations (single query)
    const allOtherMembers = await this.prisma.conversationMember.findMany({
      where: { conversationId: { in: validTargets }, userId: { not: userId } },
      select: { conversationId: true, userId: true },
      take: 1000,
    });

    // Batch: check blocks once for all involved users
    const allOtherUserIds = [...new Set(allOtherMembers.map(m => m.userId))];
    const blocks = allOtherUserIds.length > 0 ? await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: userId, blockedId: { in: allOtherUserIds } },
          { blockedId: userId, blockerId: { in: allOtherUserIds } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    }) : [];
    const blockedUserIds = new Set(blocks.map(b => b.blockerId === userId ? b.blockedId : b.blockerId));

    // Filter out conversations where any member is blocked
    const membersByConv = new Map<string, string[]>();
    for (const m of allOtherMembers) {
      if (!membersByConv.has(m.conversationId)) membersByConv.set(m.conversationId, []);
      membersByConv.get(m.conversationId)!.push(m.userId);
    }
    const allowedTargets = validTargets.filter(convId => {
      const convMembers = membersByConv.get(convId) || [];
      return !convMembers.some(uid => blockedUserIds.has(uid));
    });

    // Batch: create all forwarded messages + update conversations + increment unread in one transaction
    const now = new Date();
    const results = await this.prisma.$transaction(
      allowedTargets.flatMap(convId => [
        this.prisma.message.create({
          data: {
            conversationId: convId, senderId: userId,
            content: original.content, messageType: original.messageType,
            mediaUrl: original.mediaUrl, mediaType: original.mediaType,
            voiceDuration: original.voiceDuration, fileName: original.fileName,
            fileSize: original.fileSize,
            isForwarded: true, forwardedFromId: messageId,
          },
        }),
        this.prisma.conversation.update({
          where: { id: convId },
          data: { lastMessageText: original.content ?? '[Forwarded]', lastMessageAt: now, lastMessageById: userId },
        }),
        this.prisma.conversationMember.updateMany({
          where: { conversationId: convId, userId: { not: userId } },
          data: { unreadCount: { increment: 1 } },
        }),
      ]),
    );
    // Extract only message results (every 3rd item in the transaction: msg, conv update, unread update)
    const messages = results.filter((_, i) => i % 3 === 0);

    // Notify all target conversations (non-blocking)
    for (const convId of allowedTargets) {
      this.notifyConversationMembers(convId, userId, original.content ?? '[Forwarded]').catch((err) => {
        this.logger.warn(`Forward notification failed for conv ${convId}: ${err?.message}`);
      });
    }

    // Increment forward count on original message
    await this.prisma.message.update({
      where: { id: messageId },
      data: { forwardCount: { increment: allowedTargets.length } },
    });

    return messages;
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

    // E2E enforcement: reject plaintext scheduled messages in E2E conversations.
    // Scheduled messages are stored as plaintext in the DB and published by a cron job.
    // An E2E conversation must NEVER have plaintext messages injected via the schedule path.
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { isE2E: true },
    });
    if (convo?.isE2E) {
      throw new BadRequestException('Cannot schedule plaintext messages in E2E encrypted conversations');
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

  async starMessage(userId: string, messageId: string) {
    // Verify message exists
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');

    return this.prisma.starredMessage.upsert({
      where: { userId_messageId: { userId, messageId } },
      create: { userId, messageId },
      update: {}, // no-op if already starred
    });
  }

  async unstarMessage(userId: string, messageId: string) {
    return this.prisma.starredMessage.deleteMany({
      where: { userId, messageId },
    });
  }

  async getStarredMessages(userId: string, cursor?: string, limit = 20) {
    // Uses StarredMessage join table (replaces old starredBy String[] approach)
    const starred = await this.prisma.starredMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = starred.length > limit;
    const items = hasMore ? starred.slice(0, limit) : starred;

    // Fetch full message data for the starred entries
    const messageIds = items.map((s) => s.messageId);
    const messages = messageIds.length
      ? await this.prisma.message.findMany({
          where: { id: { in: messageIds }, isDeleted: false },
          select: MESSAGE_SELECT,
        })
      : [];

    // Preserve starred order
    const messageMap = new Map(messages.map((m) => [m.id, m]));
    const data = items
      .map((s) => messageMap.get(s.messageId))
      .filter(Boolean);

    return {
      data,
      meta: { cursor: hasMore ? items[items.length - 1].id : null, hasMore },
    };
  }

  // ── Pin Messages ──
  async pinMessage(conversationId: string, messageId: string, userId: string) {
    await this.requireMembership(conversationId, userId);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true },
    });
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

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true },
    });
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

    // Check blocks between sender and conversation members
    const otherMembers = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: senderId } },
      select: { userId: true },
      take: 200,
    });
    const otherUserIds = otherMembers.map(m => m.userId);
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

    // Check E2E enforcement
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { isE2E: true, disappearingDuration: true },
    });
    if (convo?.isE2E) {
      throw new BadRequestException('This conversation requires end-to-end encryption. Use encrypted view-once messages.');
    }

    return this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId,
          content: data.content,
          mediaUrl: data.mediaUrl,
          mediaType: data.mediaType,
          messageType: (data.messageType as MessageType) ?? 'IMAGE',
          isViewOnce: true,
          ...(convo?.disappearingDuration ? { expiresAt: new Date(Date.now() + convo.disappearingDuration * 1000) } : {}),
        },
        select: MESSAGE_SELECT,
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessageText: 'View once media',
          lastMessageById: senderId,
        },
      });

      await tx.conversationMember.updateMany({
        where: { conversationId, userId: { not: senderId } },
        data: { unreadCount: { increment: 1 } },
      });

      return msg;
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

  async pinConversation(conversationId: string, userId: string, isPinned: boolean) {
    await this.requireMembership(conversationId, userId);
    return this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isPinned },
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

    // Filter out blocked users
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
      take: 10000,
    });
    const blockedIds = new Set(blocks.map(b => b.blockerId === userId ? b.blockedId : b.blockerId));
    const filteredContactIds = contactIds.filter(id => !blockedIds.has(id));

    return this.prisma.dMNote.findMany({
      where: {
        userId: { in: filteredContactIds },
        expiresAt: { gt: new Date() },
      },
      take: 50,
    });
  }

  // ── Scheduled Message Auto-Send ──
  /**
   * Auto-send all scheduled messages whose scheduledAt has passed.
   * Runs every minute via @nestjs/schedule cron.
   * Publishes up to 200 overdue messages per tick, updating conversation metadata.
   * 200/min = 12K/hour — handles post-outage backlog without DB overload.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledMessages(): Promise<number> {
    // Distributed lock: prevent duplicate sends when multiple instances overlap
    const lockKey = 'cron:publishScheduledMessages:lock';
    const acquired = await this.redis.set(lockKey, '1', 'EX', 55, 'NX');
    if (!acquired) return 0;

    try {
      const now = new Date();

      const overdue = await this.prisma.message.findMany({
        where: {
          isScheduled: true,
          scheduledAt: { lte: now },
          isDeleted: false,
        },
        take: 200,
        orderBy: { scheduledAt: 'asc' },
      });

      if (overdue.length === 0) return 0;

      const msgIds = overdue.map(m => m.id);

      // Batch: mark all overdue messages as sent in a single updateMany
      await this.prisma.message.updateMany({
        where: { id: { in: msgIds } },
        data: { isScheduled: false, scheduledAt: null },
      });

      // Update conversation metadata per unique conversation (dedup to avoid N updates for same convo)
      const convMap = new Map<string, typeof overdue[0]>();
      for (const msg of overdue) {
        convMap.set(msg.conversationId, msg); // Last message per convo wins
      }
      for (const [convId, msg] of convMap) {
        await this.prisma.conversation.update({
          where: { id: convId },
          data: {
            lastMessageAt: now,
            lastMessageText: msg.content?.slice(0, 100) ?? null,
            lastMessageById: msg.senderId,
          },
        }).catch(err => this.logger.warn(`Failed to update conversation ${convId} for scheduled message`, err?.message));

        // Increment unread count for other members
        if (msg.senderId) {
          await this.prisma.conversationMember.updateMany({
            where: { conversationId: convId, userId: { not: msg.senderId } },
            data: { unreadCount: { increment: 1 } },
          }).catch(err => this.logger.warn(`Failed to increment unread for conv ${convId}`, err?.message));
        }
      }

      const published = overdue.length;

      // Notify conversation members (non-blocking)
      // Use generic body for E2E conversations — never leak plaintext in push
      for (const msg of overdue) {
        if (msg.senderId) {
          const body = msg.e2eVersion || msg.isEncrypted
            ? 'New message'
            : (msg.content?.slice(0, 100) ?? 'Sent a message');
          this.notifyConversationMembers(msg.conversationId, msg.senderId, body).catch((err) => {
            this.logger.warn(`Scheduled message notification failed for msg ${msg.id}: ${err?.message}`);
          });
        }
      }

      if (published > 0) {
        this.logger.log(`Auto-sent ${published} scheduled message(s)`);
      }

      return published;
    } catch (error) {
      this.logger.error('publishScheduledMessages cron failed', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
      return 0;
    }
  }

  // ── Message Expiry Job ──
  @Cron(CronExpression.EVERY_MINUTE)
  async processExpiredMessages() {
    try {
      const now = new Date();
      // Delete expired disappearing messages — clear all content AND E2E crypto metadata.
      // Ratchet keys + compromised identity key = message decryption (forward secrecy violation).
      await this.prisma.message.updateMany({
        where: { expiresAt: { lt: now }, isDeleted: false },
        data: {
          isDeleted: true,
          content: null,
          mediaUrl: null,
          fileName: null,
          voiceDuration: null,
          transcription: null,
          mediaType: null,
          fileSize: null,
          // E2E crypto fields — MUST be cleared for forward secrecy
          encryptedContent: null,
          encNonce: null,
          e2eSenderRatchetKey: null,
          e2eVersion: null,
          e2eSenderDeviceId: null,
          e2eCounter: null,
          e2ePreviousCounter: null,
          e2eSenderKeyId: null,
        },
      });
      // Delete viewed view-once messages older than 30 seconds
      const thirtySecondsAgo = new Date(now.getTime() - 30000);
      await this.prisma.message.updateMany({
        where: { isViewOnce: true, viewedAt: { lt: thirtySecondsAgo }, isDeleted: false },
        data: {
          isDeleted: true,
          content: null,
          mediaUrl: null,
          fileName: null,
          voiceDuration: null,
          transcription: null,
          mediaType: null,
          fileSize: null,
          // E2E crypto fields — MUST be cleared for forward secrecy
          encryptedContent: null,
          encNonce: null,
          e2eSenderRatchetKey: null,
          e2eVersion: null,
          e2eSenderDeviceId: null,
          e2eCounter: null,
          e2ePreviousCounter: null,
          e2eSenderKeyId: null,
        },
      });
    } catch (error) {
      this.logger.error('Failed to process expired messages', error instanceof Error ? error.message : error);
      Sentry.captureException(error);
    }
  }

  // Finding #364: Group topics — Telegram-style discussion threads within groups
  async createGroupTopic(conversationId: string, userId: string, name: string, iconEmoji?: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || !conv.isGroup) throw new NotFoundException('Group not found');

    // Only admin or creator can create topics
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member');
    if (member.role !== 'admin' && member.role !== 'owner' && conv.createdById !== userId) {
      throw new ForbiddenException('Only admins can create topics');
    }

    // Store topic using the GroupTopic model
    const topic = await this.prisma.groupTopic.create({
      data: {
        conversationId,
        name,
        iconColor: iconEmoji || null,
        createdById: userId,
      },
      select: {
        id: true,
        name: true,
        iconColor: true,
        createdAt: true,
        createdBy: { select: { id: true, username: true, displayName: true } },
      },
    });

    return { topic };
  }

  // Finding #364: Get group topics
  async getGroupTopics(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member');

    const topics = await this.prisma.groupTopic.findMany({
      where: {
        conversationId,
      },
      select: {
        id: true,
        name: true,
        iconColor: true,
        isPinned: true,
        isClosed: true,
        messageCount: true,
        lastMessageAt: true,
        createdAt: true,
        createdBy: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { data: topics };
  }

  // Finding #378: Content expiry — auto-delete messages after N days
  async setMessageExpiry(conversationId: string, userId: string, expiryDays: number) {
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found');

    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member');
    if (conv.isGroup && member.role !== 'admin' && member.role !== 'owner' && conv.createdById !== userId) {
      throw new ForbiddenException('Only admins can set message expiry');
    }

    // Valid options: 0 (off), 1, 7, 30, 90
    const validDays = [0, 1, 7, 30, 90];
    if (!validDays.includes(expiryDays)) {
      throw new BadRequestException('Invalid expiry duration. Valid: 0, 1, 7, 30, 90 days');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { disappearingDuration: expiryDays === 0 ? null : expiryDays * 24 * 60 * 60 },
    });

    return { expiryDays, message: expiryDays === 0 ? 'Message expiry disabled' : `Messages will expire after ${expiryDays} days` };
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ForwardedFromType, ChatFolderFilterType, AdminLogAction } from '@prisma/client';

const VALID_ADMIN_ACTIONS = [
  'MEMBER_ADDED', 'MEMBER_REMOVED', 'MEMBER_BANNED',
  'TITLE_CHANGED', 'PHOTO_CHANGED', 'PIN_MESSAGE', 'UNPIN_MESSAGE',
  'SLOW_MODE_CHANGED', 'PERMISSIONS_CHANGED',
  'TOPIC_CREATED', 'TOPIC_UPDATED', 'TOPIC_DELETED',
  'EMOJI_PACK_CREATED', 'EMOJI_PACK_UPDATED', 'EMOJI_PACK_DELETED',
  'EMOJI_ADDED', 'EMOJI_REMOVED',
] as const;

@Injectable()
export class TelegramFeaturesService {
  constructor(private prisma: PrismaService) {}

  // ── Saved Messages ──────────────────────────────────────

  async getSavedMessages(userId: string, cursor?: string, limit = 20) {
    const messages = await this.prisma.savedMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();
    return {
      data: messages,
      meta: { cursor: hasMore ? messages[messages.length - 1]?.id ?? null : null, hasMore },
    };
  }

  async saveMessage(userId: string, dto: {
    content?: string; mediaUrl?: string; mediaType?: string;
    forwardedFromType?: string; forwardedFromId?: string;
  }) {
    // Validate that at least content or mediaUrl is provided
    if (!dto.content?.trim() && !dto.mediaUrl) {
      throw new BadRequestException('Either content or mediaUrl is required');
    }
    if (dto.content && dto.content.length > 10000) {
      throw new BadRequestException('Content must be 10,000 characters or less');
    }
    if (dto.forwardedFromType && !['FWD_POST', 'FWD_THREAD', 'FWD_REEL', 'FWD_VIDEO', 'FWD_MESSAGE'].includes(dto.forwardedFromType)) {
      throw new BadRequestException('Invalid forwardedFromType');
    }

    // Validate forwardedFromId is provided when forwardedFromType is set (Finding 32)
    if (dto.forwardedFromType && !dto.forwardedFromId) {
      throw new BadRequestException('forwardedFromId is required when forwardedFromType is set');
    }

    return this.prisma.savedMessage.create({
      data: { userId, ...dto, forwardedFromType: dto.forwardedFromType as ForwardedFromType | undefined },
    });
  }

  async deleteSavedMessage(userId: string, messageId: string) {
    const msg = await this.prisma.savedMessage.findFirst({ where: { id: messageId, userId } });
    if (!msg) throw new NotFoundException('Saved message not found');
    return this.prisma.savedMessage.delete({ where: { id: messageId } });
  }

  async pinSavedMessage(userId: string, messageId: string) {
    const msg = await this.prisma.savedMessage.findFirst({ where: { id: messageId, userId } });
    if (!msg) throw new NotFoundException('Saved message not found');
    return this.prisma.savedMessage.update({
      where: { id: messageId },
      data: { isPinned: !msg.isPinned },
    });
  }

  async searchSavedMessages(userId: string, query: string, cursor?: string, limit = 20) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Search query is required');
    }

    const where: Record<string, unknown> = {
      userId,
      content: { contains: query.trim(), mode: 'insensitive' },
    };
    if (cursor) where.id = { lt: cursor };

    const messages = await this.prisma.savedMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();
    return {
      data: messages,
      meta: { cursor: hasMore ? messages[messages.length - 1]?.id ?? null : null, hasMore },
    };
  }

  // ── Chat Folders ────────────────────────────────────────

  async getChatFolders(userId: string) {
    return this.prisma.chatFolder.findMany({
      where: { userId },
      orderBy: { position: 'asc' },
      take: 50,
    });
  }

  async getFolderConversations(userId: string, folderId: string, cursor?: string, limit = 50) {
    const folder = await this.prisma.chatFolder.findFirst({ where: { id: folderId, userId } });
    if (!folder) throw new NotFoundException('Chat folder not found');

    const where: Record<string, unknown> = {
      members: { some: { userId } },
    };

    // Apply folder filters
    if (folder.conversationIds.length > 0) {
      if (folder.filterType === 'EXCLUDE') {
        where.id = { notIn: folder.conversationIds };
      } else {
        where.id = { in: folder.conversationIds };
      }
    }

    if (folder.includeGroups && !folder.includeChannels) {
      where.isGroup = true;
    } else if (folder.includeChannels && !folder.includeGroups) {
      where.isGroup = false;
    }

    if (cursor) {
      (where as Record<string, unknown>).id = {
        ...((where.id as Record<string, unknown>) || {}),
        lt: cursor,
      };
    }

    const conversations = await this.prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = conversations.length > limit;
    if (hasMore) conversations.pop();
    return {
      data: conversations,
      meta: { cursor: hasMore ? conversations[conversations.length - 1]?.id ?? null : null, hasMore },
    };
  }

  async createChatFolder(userId: string, dto: {
    name: string; icon?: string; conversationIds?: string[];
    includeGroups?: boolean; includeChannels?: boolean;
    filterType?: string; includeBots?: boolean;
  }) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Folder name is required');
    }
    if (dto.name.length > 50) {
      throw new BadRequestException('Folder name must be 50 characters or less');
    }

    const count = await this.prisma.chatFolder.count({ where: { userId } });
    if (count >= 10) throw new BadRequestException('Maximum 10 chat folders');

    // Validate conversationIds — verify user is member of each conversation (Finding 9)
    if (dto.conversationIds && dto.conversationIds.length > 0) {
      const memberships = await this.prisma.conversationMember.findMany({
        where: { userId, conversationId: { in: dto.conversationIds } },
        select: { conversationId: true },
        take: 50,
      });
      const memberConvIds = new Set(memberships.map(m => m.conversationId));
      const invalidIds = dto.conversationIds.filter(id => !memberConvIds.has(id));
      if (invalidIds.length > 0) {
        throw new ForbiddenException(`Not a member of conversations: ${invalidIds.join(', ')}`);
      }
    }

    return this.prisma.chatFolder.create({
      data: {
        userId,
        name: dto.name.trim(),
        icon: dto.icon,
        position: count,
        conversationIds: dto.conversationIds || [],
        includeGroups: dto.includeGroups || false,
        includeChannels: dto.includeChannels || false,
        filterType: (dto.filterType || 'INCLUDE') as ChatFolderFilterType,
        includeBots: dto.includeBots || false,
      },
    });
  }

  async updateChatFolder(userId: string, folderId: string, dto: {
    name?: string; icon?: string; conversationIds?: string[];
    includeGroups?: boolean; includeChannels?: boolean;
    filterType?: string; includeBots?: boolean;
  }) {
    const folder = await this.prisma.chatFolder.findFirst({ where: { id: folderId, userId } });
    if (!folder) throw new NotFoundException('Chat folder not found');

    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Folder name is required');
      if (dto.name.length > 50) throw new BadRequestException('Folder name must be 50 characters or less');
      dto.name = dto.name.trim();
    }

    // Validate conversationIds if provided (Finding 9)
    if (dto.conversationIds && dto.conversationIds.length > 0) {
      const memberships = await this.prisma.conversationMember.findMany({
        where: { userId, conversationId: { in: dto.conversationIds } },
        select: { conversationId: true },
        take: 50,
      });
      const memberConvIds = new Set(memberships.map(m => m.conversationId));
      const invalidIds = dto.conversationIds.filter(id => !memberConvIds.has(id));
      if (invalidIds.length > 0) {
        throw new ForbiddenException(`Not a member of conversations: ${invalidIds.join(', ')}`);
      }
    }

    return this.prisma.chatFolder.update({ where: { id: folderId }, data: { ...dto, filterType: dto.filterType as ChatFolderFilterType | undefined } });
  }

  async deleteChatFolder(userId: string, folderId: string) {
    const folder = await this.prisma.chatFolder.findFirst({ where: { id: folderId, userId } });
    if (!folder) throw new NotFoundException('Chat folder not found');
    return this.prisma.chatFolder.delete({ where: { id: folderId } });
  }

  async reorderChatFolders(userId: string, folderIds: string[]) {
    if (!folderIds || folderIds.length === 0) {
      throw new BadRequestException('folderIds array is required');
    }

    // Verify all folders belong to the user
    const folders = await this.prisma.chatFolder.findMany({
      where: { userId },
      select: { id: true },
      take: 50,
    });
    const ownedIds = new Set(folders.map((f) => f.id));

    // Validate complete set — all owned folders must be included (Finding 16)
    if (folderIds.length !== ownedIds.size) {
      throw new BadRequestException(
        `Must reorder all folders. Expected ${ownedIds.size} folder IDs, got ${folderIds.length}`,
      );
    }

    for (const id of folderIds) {
      if (!ownedIds.has(id)) {
        throw new ForbiddenException(`Folder ${id} does not belong to you`);
      }
    }

    // Check for duplicates
    const uniqueIds = new Set(folderIds);
    if (uniqueIds.size !== folderIds.length) {
      throw new BadRequestException('Duplicate folder IDs are not allowed');
    }

    // Batch reorder in a single transaction instead of N individual queries
    await this.prisma.$transaction(
      folderIds.map((id, index) =>
        this.prisma.chatFolder.updateMany({ where: { id, userId }, data: { position: index } }),
      ),
    );
    return { success: true };
  }

  // ── Slow Mode ───────────────────────────────────────────

  async setSlowMode(conversationId: string, adminId: string, seconds: number) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: adminId } },
    });
    if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
      throw new ForbiddenException('Only admins can set slow mode');
    }

    // Verify this is a group conversation (Finding 35)
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { isGroup: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (!conversation.isGroup) {
      throw new BadRequestException('Slow mode can only be set on group conversations');
    }

    const validIntervals = [0, 30, 60, 300, 900, 3600];
    if (!validIntervals.includes(seconds)) {
      throw new BadRequestException('Invalid slow mode interval. Valid: 0, 30, 60, 300, 900, 3600');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { slowModeSeconds: seconds === 0 ? null : seconds },
    });

    // Log admin action
    await this.logAdminAction(conversationId, adminId, 'SLOW_MODE_CHANGED', undefined, `Slow mode set to ${seconds}s`);

    return { success: true, slowModeSeconds: seconds };
  }

  // ── Admin Log ───────────────────────────────────────────

  async getAdminLog(conversationId: string, userId: string, cursor?: string, limit = 50) {
    // Verify user is admin/owner of the group
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
      throw new ForbiddenException('Only admins can view the admin log');
    }

    const where: Record<string, unknown> = { groupId: conversationId };
    if (cursor) where.id = { lt: cursor };

    const logs = await this.prisma.adminLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = logs.length > limit;
    if (hasMore) logs.pop();
    return {
      data: logs,
      meta: { cursor: hasMore ? logs[logs.length - 1]?.id ?? null : null, hasMore },
    };
  }

  async logAdminAction(
    groupId: string,
    adminId: string,
    action: string,
    targetId?: string,
    details?: string,
  ) {
    // Validate action against known action types (Finding 10)
    if (!VALID_ADMIN_ACTIONS.includes(action as typeof VALID_ADMIN_ACTIONS[number])) {
      throw new BadRequestException(`Invalid admin action: ${action}. Valid actions: ${VALID_ADMIN_ACTIONS.join(', ')}`);
    }

    return this.prisma.adminLog.create({
      data: { groupId, adminId, action: action as AdminLogAction, targetId, details },
    });
  }

  // ── Group Topics ────────────────────────────────────────

  async createTopic(conversationId: string, userId: string, dto: { name: string; iconColor?: string }) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Topic name is required');
    }
    if (dto.name.length > 100) {
      throw new BadRequestException('Topic name must be 100 characters or less');
    }

    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new NotFoundException('Not a member of this group');

    const count = await this.prisma.groupTopic.count({ where: { conversationId } });
    if (count >= 100) throw new BadRequestException('Maximum 100 topics per group');

    const topic = await this.prisma.groupTopic.create({
      data: { conversationId, name: dto.name.trim(), iconColor: dto.iconColor, createdById: userId },
    });

    // Log admin action for topic creation (Finding 12)
    await this.logAdminAction(conversationId, userId, 'TOPIC_CREATED', topic.id, `Topic "${dto.name.trim()}" created`);

    return topic;
  }

  async getTopics(conversationId: string, userId: string) {
    // Verify membership before returning topics (Finding 7)
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this group');

    return this.prisma.groupTopic.findMany({
      where: { conversationId },
      orderBy: [{ isPinned: 'desc' }, { lastMessageAt: 'desc' }],
      take: 100,
    });
  }

  async updateTopic(topicId: string, userId: string, dto: { name?: string; iconColor?: string; isPinned?: boolean; isClosed?: boolean }) {
    const topic = await this.prisma.groupTopic.findUnique({
      where: { id: topicId },
    });
    if (!topic) throw new NotFoundException('Topic not found');

    // Verify user is admin/owner of the conversation
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: topic.conversationId, userId } },
    });
    if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
      throw new ForbiddenException('Only admins can update topics');
    }

    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Topic name is required');
      if (dto.name.length > 100) throw new BadRequestException('Topic name must be 100 characters or less');
      dto.name = dto.name.trim();
    }

    const updated = await this.prisma.groupTopic.update({ where: { id: topicId }, data: dto });

    // Log admin action for topic update (Finding 12)
    const changes: string[] = [];
    if (dto.name) changes.push(`name="${dto.name}"`);
    if (dto.isPinned !== undefined) changes.push(`isPinned=${dto.isPinned}`);
    if (dto.isClosed !== undefined) changes.push(`isClosed=${dto.isClosed}`);
    if (dto.iconColor) changes.push(`iconColor=${dto.iconColor}`);
    await this.logAdminAction(topic.conversationId, userId, 'TOPIC_UPDATED', topicId, changes.join(', '));

    return updated;
  }

  async deleteTopic(topicId: string, userId: string) {
    const topic = await this.prisma.groupTopic.findUnique({
      where: { id: topicId },
    });
    if (!topic) throw new NotFoundException('Topic not found');

    // Verify user is admin/owner of the conversation
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: topic.conversationId, userId } },
    });
    if (!member || (member.role !== 'admin' && member.role !== 'owner')) {
      throw new ForbiddenException('Only admins can delete topics');
    }

    const deleted = await this.prisma.groupTopic.delete({ where: { id: topicId } });

    // Log admin action for topic deletion (Finding 12)
    await this.logAdminAction(topic.conversationId, userId, 'TOPIC_DELETED', topicId, `Topic "${topic.name}" deleted`);

    return deleted;
  }

  // ── Custom Emoji Packs ──────────────────────────────────

  async createEmojiPack(userId: string, dto: { name: string; description?: string }) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Pack name is required');
    }
    if (dto.name.length > 100) {
      throw new BadRequestException('Pack name must be 100 characters or less');
    }

    return this.prisma.customEmojiPack.create({
      data: { creatorId: userId, name: dto.name.trim(), description: dto.description },
    });
  }

  async updateEmojiPack(packId: string, userId: string, dto: { name?: string; description?: string; isPublic?: boolean }) {
    const pack = await this.prisma.customEmojiPack.findFirst({ where: { id: packId, creatorId: userId } });
    if (!pack) throw new NotFoundException('Emoji pack not found or not yours');

    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Pack name is required');
      if (dto.name.length > 100) throw new BadRequestException('Pack name must be 100 characters or less');
      dto.name = dto.name.trim();
    }

    return this.prisma.customEmojiPack.update({ where: { id: packId }, data: dto });
  }

  async deleteEmojiPack(packId: string, userId: string) {
    const pack = await this.prisma.customEmojiPack.findFirst({ where: { id: packId, creatorId: userId } });
    if (!pack) throw new NotFoundException('Emoji pack not found or not yours');
    return this.prisma.customEmojiPack.delete({ where: { id: packId } });
  }

  async deleteEmoji(emojiId: string, userId: string) {
    const emoji = await this.prisma.customEmoji.findUnique({
      where: { id: emojiId },
      include: { pack: { select: { creatorId: true } } },
    });
    if (!emoji) throw new NotFoundException('Emoji not found');
    if (emoji.pack.creatorId !== userId) {
      throw new ForbiddenException('Only the pack creator can delete emojis');
    }

    return this.prisma.customEmoji.delete({ where: { id: emojiId } });
  }

  async addEmojiToPack(packId: string, userId: string, dto: { shortcode: string; imageUrl: string; isAnimated?: boolean }) {
    const pack = await this.prisma.customEmojiPack.findFirst({ where: { id: packId, creatorId: userId } });
    if (!pack) throw new NotFoundException('Emoji pack not found or not yours');

    if (!dto.shortcode?.trim()) throw new BadRequestException('Shortcode is required');
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(dto.shortcode)) {
      throw new BadRequestException('Shortcode must be 2-32 alphanumeric characters or underscores');
    }

    // Check for duplicate shortcode within pack (Finding 31 — also enforced by @@unique in schema)
    const existing = await this.prisma.customEmoji.findUnique({
      where: { packId_shortcode: { packId, shortcode: dto.shortcode } },
    });
    if (existing) {
      throw new BadRequestException(`Shortcode "${dto.shortcode}" already exists in this pack`);
    }

    const count = await this.prisma.customEmoji.count({ where: { packId } });
    if (count >= 120) throw new BadRequestException('Maximum 120 emoji per pack');

    const emoji = await this.prisma.customEmoji.create({
      data: { packId, shortcode: dto.shortcode, imageUrl: dto.imageUrl, isAnimated: dto.isAnimated || false },
    });

    // Increment pack usage count when emoji is added (Finding 18)
    await this.prisma.customEmojiPack.update({
      where: { id: packId },
      data: { usageCount: { increment: 1 } },
    });

    return emoji;
  }

  async getEmojiPacks(cursor?: string, limit = 20) {
    const where: Record<string, unknown> = { isPublic: true };
    if (cursor) where.id = { lt: cursor };

    const packs = await this.prisma.customEmojiPack.findMany({
      where,
      orderBy: { usageCount: 'desc' },
      take: limit + 1,
      include: {
        creator: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        emojis: { take: 5 },
      },
    });

    const hasMore = packs.length > limit;
    if (hasMore) packs.pop();
    return {
      data: packs,
      meta: { cursor: hasMore ? packs[packs.length - 1]?.id ?? null : null, hasMore },
    };
  }

  async getMyEmojiPacks(userId: string) {
    return this.prisma.customEmojiPack.findMany({
      where: { creatorId: userId },
      include: { emojis: true, _count: { select: { emojis: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

@Injectable()
export class TelegramFeaturesService {
  constructor(private prisma: PrismaService) {}

  // ── Saved Messages ──────────────────────────────────────

  async getSavedMessages(userId: string, cursor?: string, limit = 20) {
    const where: Record<string, unknown> = { userId };
    if (cursor) where.id = { lt: cursor };

    const messages = await this.prisma.savedMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();
    return { data: messages, meta: { cursor: messages[messages.length - 1]?.id || null, hasMore } };
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
    if (dto.forwardedFromType && !['post', 'thread', 'reel', 'video', 'message'].includes(dto.forwardedFromType)) {
      throw new BadRequestException('Invalid forwardedFromType');
    }

    return this.prisma.savedMessage.create({
      data: { userId, ...dto },
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

  async searchSavedMessages(userId: string, query: string, limit = 20) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Search query is required');
    }

    return this.prisma.savedMessage.findMany({
      where: {
        userId,
        content: { contains: query.trim(), mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ── Chat Folders ────────────────────────────────────────

  async getChatFolders(userId: string) {
    return this.prisma.chatFolder.findMany({
      where: { userId },
      orderBy: { position: 'asc' },
      take: 50,
    });
  }

  async createChatFolder(userId: string, dto: {
    name: string; icon?: string; conversationIds?: string[];
    includeGroups?: boolean; includeChannels?: boolean;
  }) {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Folder name is required');
    }
    if (dto.name.length > 50) {
      throw new BadRequestException('Folder name must be 50 characters or less');
    }

    const count = await this.prisma.chatFolder.count({ where: { userId } });
    if (count >= 10) throw new BadRequestException('Maximum 10 chat folders');

    return this.prisma.chatFolder.create({
      data: {
        userId,
        name: dto.name.trim(),
        icon: dto.icon,
        position: count,
        conversationIds: dto.conversationIds || [],
        includeGroups: dto.includeGroups || false,
        includeChannels: dto.includeChannels || false,
      },
    });
  }

  async updateChatFolder(userId: string, folderId: string, dto: {
    name?: string; icon?: string; conversationIds?: string[];
    includeGroups?: boolean; includeChannels?: boolean;
  }) {
    const folder = await this.prisma.chatFolder.findFirst({ where: { id: folderId, userId } });
    if (!folder) throw new NotFoundException('Chat folder not found');

    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Folder name is required');
      if (dto.name.length > 50) throw new BadRequestException('Folder name must be 50 characters or less');
      dto.name = dto.name.trim();
    }

    return this.prisma.chatFolder.update({ where: { id: folderId }, data: dto });
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
    for (const id of folderIds) {
      if (!ownedIds.has(id)) {
        throw new ForbiddenException(`Folder ${id} does not belong to you`);
      }
    }

    await Promise.all(
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

    const validIntervals = [0, 30, 60, 300, 900, 3600];
    if (!validIntervals.includes(seconds)) {
      throw new BadRequestException('Invalid slow mode interval. Valid: 0, 30, 60, 300, 900, 3600');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { slowModeSeconds: seconds === 0 ? null : seconds },
    });

    // Log admin action
    await this.prisma.adminLog.create({
      data: {
        groupId: conversationId,
        adminId,
        action: 'slow_mode_changed',
        details: `Slow mode set to ${seconds}s`,
      },
    });

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
    return { data: logs, meta: { cursor: logs[logs.length - 1]?.id || null, hasMore } };
  }

  async logAdminAction(groupId: string, adminId: string, action: string, targetId?: string, details?: string) {
    return this.prisma.adminLog.create({
      data: { groupId, adminId, action, targetId, details },
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

    return this.prisma.groupTopic.create({
      data: { conversationId, name: dto.name.trim(), iconColor: dto.iconColor, createdById: userId },
    });
  }

  async getTopics(conversationId: string) {
    return this.prisma.groupTopic.findMany({
      where: { conversationId },
      orderBy: [{ isPinned: 'desc' }, { lastMessageAt: 'desc' }],
      take: 50,
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

    return this.prisma.groupTopic.update({ where: { id: topicId }, data: dto });
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

    return this.prisma.groupTopic.delete({ where: { id: topicId } });
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

  async addEmojiToPack(packId: string, userId: string, dto: { shortcode: string; imageUrl: string; isAnimated?: boolean }) {
    const pack = await this.prisma.customEmojiPack.findFirst({ where: { id: packId, creatorId: userId } });
    if (!pack) throw new NotFoundException('Emoji pack not found or not yours');

    if (!dto.shortcode?.trim()) throw new BadRequestException('Shortcode is required');
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(dto.shortcode)) {
      throw new BadRequestException('Shortcode must be 2-32 alphanumeric characters or underscores');
    }

    const count = await this.prisma.customEmoji.count({ where: { packId } });
    if (count >= 120) throw new BadRequestException('Maximum 120 emoji per pack');

    return this.prisma.customEmoji.create({
      data: { packId, shortcode: dto.shortcode, imageUrl: dto.imageUrl, isAnimated: dto.isAnimated || false },
    });
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
    return { data: packs, meta: { cursor: packs[packs.length - 1]?.id || null, hasMore } };
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

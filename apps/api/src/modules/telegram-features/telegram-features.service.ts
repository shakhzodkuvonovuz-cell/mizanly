import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

  async saveMesage(userId: string, dto: {
    content?: string; mediaUrl?: string; mediaType?: string;
    forwardedFromType?: string; forwardedFromId?: string;
  }) {
    return this.prisma.savedMessage.create({
      data: { userId, ...dto },
    });
  }

  async deleteSavedMessage(userId: string, messageId: string) {
    const msg = await this.prisma.savedMessage.findFirst({ where: { id: messageId, userId } });
    if (!msg) throw new NotFoundException();
    return this.prisma.savedMessage.delete({ where: { id: messageId } });
  }

  async pinSavedMessage(userId: string, messageId: string) {
    const msg = await this.prisma.savedMessage.findFirst({ where: { id: messageId, userId } });
    if (!msg) throw new NotFoundException();
    return this.prisma.savedMessage.update({
      where: { id: messageId },
      data: { isPinned: !msg.isPinned },
    });
  }

  async searchSavedMessages(userId: string, query: string, limit = 20) {
    return this.prisma.savedMessage.findMany({
      where: {
        userId,
        content: { contains: query, mode: 'insensitive' },
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
    });
  }

  async createChatFolder(userId: string, dto: {
    name: string; icon?: string; conversationIds?: string[];
    includeGroups?: boolean; includeChannels?: boolean;
  }) {
    const count = await this.prisma.chatFolder.count({ where: { userId } });
    if (count >= 10) throw new BadRequestException('Maximum 10 chat folders');

    return this.prisma.chatFolder.create({
      data: {
        userId,
        name: dto.name,
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
    if (!folder) throw new NotFoundException();
    return this.prisma.chatFolder.update({ where: { id: folderId }, data: dto });
  }

  async deleteChatFolder(userId: string, folderId: string) {
    const folder = await this.prisma.chatFolder.findFirst({ where: { id: folderId, userId } });
    if (!folder) throw new NotFoundException();
    return this.prisma.chatFolder.delete({ where: { id: folderId } });
  }

  async reorderChatFolders(userId: string, folderIds: string[]) {
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
      throw new BadRequestException('Only admins can set slow mode');
    }

    const validIntervals = [0, 30, 60, 300, 900, 3600];
    if (!validIntervals.includes(seconds)) {
      throw new BadRequestException('Invalid slow mode interval');
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

  async getAdminLog(conversationId: string, cursor?: string, limit = 50) {
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
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new NotFoundException('Not a member');

    const count = await this.prisma.groupTopic.count({ where: { conversationId } });
    if (count >= 100) throw new BadRequestException('Maximum 100 topics per group');

    return this.prisma.groupTopic.create({
      data: { conversationId, name: dto.name, iconColor: dto.iconColor, createdById: userId },
    });
  }

  async getTopics(conversationId: string) {
    return this.prisma.groupTopic.findMany({
      where: { conversationId },
      orderBy: [{ isPinned: 'desc' }, { lastMessageAt: 'desc' }],
    });
  }

  async updateTopic(topicId: string, userId: string, dto: { name?: string; iconColor?: string; isPinned?: boolean; isClosed?: boolean }) {
    return this.prisma.groupTopic.update({ where: { id: topicId }, data: dto });
  }

  async deleteTopic(topicId: string, userId: string) {
    return this.prisma.groupTopic.delete({ where: { id: topicId } });
  }

  // ── Custom Emoji Packs ──────────────────────────────────

  async createEmojiPack(userId: string, dto: { name: string; description?: string }) {
    return this.prisma.customEmojiPack.create({
      data: { creatorId: userId, name: dto.name, description: dto.description },
    });
  }

  async addEmojiToPack(packId: string, userId: string, dto: { shortcode: string; imageUrl: string; isAnimated?: boolean }) {
    const pack = await this.prisma.customEmojiPack.findFirst({ where: { id: packId, creatorId: userId } });
    if (!pack) throw new NotFoundException();

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
    });
  }
}

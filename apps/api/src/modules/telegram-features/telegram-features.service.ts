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
}

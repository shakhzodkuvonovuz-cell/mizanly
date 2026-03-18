import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

interface ExportedMessage {
  id: string;
  content: string | null;
  messageType: string;
  mediaUrl: string | null;
  createdAt: Date;
  sender: { username: string; displayName: string };
}

export interface JsonExportResult {
  conversation: {
    id: string;
    name: string;
    isGroup: boolean;
    createdAt: Date;
    messageCount: number;
  };
  messages: Array<{
    id: string;
    sender: string;
    content: string | null;
    type: string;
    mediaUrl?: string;
    timestamp: string;
  }>;
  exportedAt: string;
  exportedBy: string;
}

export interface TextExportResult {
  text: string;
  messageCount: number;
}

export interface ConversationStats {
  name: string;
  isGroup: boolean;
  memberCount: number;
  messageCount: number;
  mediaCount: number;
  createdAt: Date | undefined;
}

@Injectable()
export class ChatExportService {
  constructor(private prisma: PrismaService) {}

  async generateExport(
    conversationId: string,
    userId: string,
    format: 'json' | 'text',
    includeMedia: boolean,
  ): Promise<JsonExportResult | TextExportResult> {
    // 1. Verify membership
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this conversation');
    }

    // 2. Get conversation info
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, isGroup: true, groupName: true, createdAt: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // 3. Fetch all messages in batches of 100
    const allMessages: ExportedMessage[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const messages = await this.prisma.message.findMany({
        where: { conversationId, isDeleted: false },
        select: {
          id: true,
          content: true,
          messageType: true,
          mediaUrl: includeMedia,
          createdAt: true,
          sender: { select: { username: true, displayName: true } },
        },
        take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'asc' },
      });

      hasMore = messages.length > 100;
      const batch = hasMore ? messages.slice(0, 100) : messages;

      for (const msg of batch) {
        allMessages.push({
          id: msg.id,
          content: msg.content,
          messageType: msg.messageType,
          mediaUrl: includeMedia ? ((msg as Record<string, unknown>).mediaUrl as string | null) ?? null : null,
          createdAt: msg.createdAt,
          sender: msg.sender,
        });
      }

      if (batch.length > 0) {
        cursor = batch[batch.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    // 4. Format output
    if (format === 'json') {
      return this.formatAsJson(conversation, allMessages, userId, includeMedia);
    }

    return this.formatAsText(conversation, allMessages, includeMedia);
  }

  async getConversationStats(
    conversationId: string,
    userId: string,
  ): Promise<ConversationStats> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('Not a member');
    }

    const [messageCount, mediaCount, conversation] = await Promise.all([
      this.prisma.message.count({
        where: { conversationId, isDeleted: false },
      }),
      this.prisma.message.count({
        where: {
          conversationId,
          isDeleted: false,
          messageType: { in: ['IMAGE', 'VIDEO', 'VOICE', 'FILE'] },
        },
      }),
      this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          groupName: true,
          isGroup: true,
          createdAt: true,
          _count: { select: { members: true } },
        },
      }),
    ]);

    return {
      name: conversation?.groupName || 'Direct Message',
      isGroup: conversation?.isGroup ?? false,
      memberCount: conversation?._count?.members ?? 0,
      messageCount,
      mediaCount,
      createdAt: conversation?.createdAt,
    };
  }

  private formatAsJson(
    conversation: { id: string; isGroup: boolean; groupName: string | null; createdAt: Date },
    messages: ExportedMessage[],
    userId: string,
    includeMedia: boolean,
  ): JsonExportResult {
    return {
      conversation: {
        id: conversation.id,
        name: conversation.groupName || 'Direct Message',
        isGroup: conversation.isGroup,
        createdAt: conversation.createdAt,
        messageCount: messages.length,
      },
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender.displayName || m.sender.username,
        content: m.content,
        type: m.messageType,
        ...(includeMedia && m.mediaUrl ? { mediaUrl: m.mediaUrl } : {}),
        timestamp: m.createdAt.toISOString(),
      })),
      exportedAt: new Date().toISOString(),
      exportedBy: userId,
    };
  }

  private formatAsText(
    conversation: { groupName: string | null },
    messages: ExportedMessage[],
    includeMedia: boolean,
  ): TextExportResult {
    const header = [
      `Chat Export: ${conversation.groupName || 'Direct Message'}`,
      `Exported: ${new Date().toISOString()}`,
      `Messages: ${messages.length}`,
      '='.repeat(50),
      '',
    ].join('\n');

    const body = messages
      .map((m) => {
        const date = m.createdAt.toISOString().replace('T', ' ').slice(0, 19);
        const sender = m.sender.displayName || m.sender.username;
        const content = m.content || `[${m.messageType}]`;
        const media = includeMedia && m.mediaUrl ? ` (${m.mediaUrl})` : '';
        return `[${date}] ${sender}: ${content}${media}`;
      })
      .join('\n');

    return { text: header + '\n' + body, messageCount: messages.length };
  }
}

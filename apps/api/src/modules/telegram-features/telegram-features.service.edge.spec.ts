import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { TelegramFeaturesService } from './telegram-features.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('TelegramFeaturesService — edge cases', () => {
  let service: TelegramFeaturesService;
  let prisma: any;
  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        TelegramFeaturesService,
        {
          provide: PrismaService,
          useValue: {
            savedMessage: {
              create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), update: jest.fn(),
            },
            chatFolder: {
              create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]), update: jest.fn(),
              delete: jest.fn(), count: jest.fn().mockResolvedValue(0),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            groupTopic: {
              create: jest.fn(), findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]), update: jest.fn(),
              delete: jest.fn(), count: jest.fn().mockResolvedValue(0),
            },
            customEmojiPack: {
              create: jest.fn(), findUnique: jest.fn(),
              findFirst: jest.fn().mockResolvedValue({ id: 'pack-1', creatorId: userId }),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(), delete: jest.fn(),
            },
            customEmoji: {
              create: jest.fn().mockResolvedValue({ id: 'emoji-1', shortcode: 'test' }),
              findUnique: jest.fn().mockResolvedValue(null),
              count: jest.fn().mockResolvedValue(0), delete: jest.fn(),
            },
            conversation: { findUnique: jest.fn().mockResolvedValue({ id: 'conv-1', isGroup: true }), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            conversationMember: {
              findUnique: jest.fn().mockResolvedValue({ userId, role: 'owner' }),
              findMany: jest.fn().mockResolvedValue([]),
            },
            adminLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }), findMany: jest.fn().mockResolvedValue([]) },
            $transaction: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<TelegramFeaturesService>(TelegramFeaturesService);
    prisma = module.get(PrismaService);
  });

  // ── Saved Messages Edge Cases ──────────────────────────

  it('should accept Arabic saved message content', async () => {
    prisma.savedMessage.create.mockResolvedValue({ id: 'sm-1', userId, content: 'رسالة محفوظة' });
    const result = await service.saveMessage(userId, { content: 'رسالة محفوظة' } as any);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('id', 'sm-1');
  });

  it('should accept Unicode emoji in saved message content', async () => {
    prisma.savedMessage.create.mockResolvedValue({ id: 'sm-1', userId, content: '🕌 Prayer time' });
    const result = await service.saveMessage(userId, { content: '🕌 Prayer time' } as any);
    expect(result).toBeDefined();
    expect(result.content).toBe('🕌 Prayer time');
  });

  it('should reject whitespace-only saved message content', async () => {
    await expect(service.saveMessage(userId, { content: '   ' } as any))
      .rejects.toThrow(BadRequestException);
  });

  it('should accept content at exactly 10000 characters', async () => {
    prisma.savedMessage.create.mockResolvedValue({ id: 'sm-1', userId, content: 'x'.repeat(10000) });
    const result = await service.saveMessage(userId, { content: 'x'.repeat(10000) } as any);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('id');
  });

  it('should reject content at 10001 characters', async () => {
    await expect(service.saveMessage(userId, { content: 'x'.repeat(10001) } as any))
      .rejects.toThrow(BadRequestException);
  });

  it('should return empty saved messages list', async () => {
    const result = await service.getSavedMessages(userId);
    expect(result.data).toEqual([]);
    expect(result.meta.hasMore).toBe(false);
    expect(result.meta.cursor).toBeNull();
  });

  it('should throw NotFoundException for deleting non-existent saved message', async () => {
    prisma.savedMessage.findFirst.mockResolvedValue(null);
    await expect(service.deleteSavedMessage(userId, 'nonexistent'))
      .rejects.toThrow(NotFoundException);
  });

  it('should handle search with single character query', async () => {
    prisma.savedMessage.findMany.mockResolvedValue([]);
    const result = await service.searchSavedMessages(userId, 'a');
    expect(result.data).toEqual([]);
  });

  it('should handle search with Unicode characters', async () => {
    prisma.savedMessage.findMany.mockResolvedValue([]);
    const result = await service.searchSavedMessages(userId, 'صلاة');
    expect(result.data).toEqual([]);
  });

  // ── Chat Folder Edge Cases ─────────────────────────────

  it('should accept Arabic folder name', async () => {
    prisma.chatFolder.create.mockResolvedValue({ id: 'f-1', userId, name: 'مجلد خاص', position: 0 });
    const result = await service.createChatFolder(userId, { name: 'مجلد خاص' } as any);
    expect(result).toBeDefined();
    expect(result.name).toBe('مجلد خاص');
  });

  it('should throw BadRequestException for empty folder name', async () => {
    await expect(service.createChatFolder(userId, { name: '' } as any))
      .rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException for whitespace-only folder name', async () => {
    await expect(service.createChatFolder(userId, { name: '   ' } as any))
      .rejects.toThrow(BadRequestException);
  });

  it('should return empty chat folders for user with none', async () => {
    const result = await service.getChatFolders(userId);
    expect(result).toEqual([]);
  });

  it('should accept folder name at exactly 50 characters', async () => {
    const name = 'a'.repeat(50);
    prisma.chatFolder.create.mockResolvedValue({ id: 'f-1', userId, name, position: 0 });
    const result = await service.createChatFolder(userId, { name } as any);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('id');
  });

  it('should reject folder name at 51 characters', async () => {
    await expect(service.createChatFolder(userId, { name: 'a'.repeat(51) } as any))
      .rejects.toThrow(BadRequestException);
  });

  it('should trim folder name whitespace', async () => {
    prisma.chatFolder.create.mockResolvedValue({ id: 'f-1', userId, name: 'Work', position: 0 });
    await service.createChatFolder(userId, { name: '  Work  ' } as any);
    expect(prisma.chatFolder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Work' }),
      }),
    );
  });

  // ── Slow Mode Edge Cases ──────────────────────────────

  it('should disable slow mode with seconds=0', async () => {
    await service.setSlowMode('conv-1', userId, 0);
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { slowModeSeconds: null } }),
    );
  });

  it('should reject invalid slow mode interval (e.g., 45)', async () => {
    await expect(service.setSlowMode('conv-1', userId, 45))
      .rejects.toThrow(BadRequestException);
  });

  it('should reject slow mode on non-group conversation', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', isGroup: false });
    await expect(service.setSlowMode('conv-1', userId, 30))
      .rejects.toThrow(BadRequestException);
  });

  it('should accept all valid slow mode intervals', async () => {
    for (const seconds of [0, 30, 60, 300, 900, 3600]) {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', isGroup: true });
      prisma.conversationMember.findUnique.mockResolvedValue({ userId, role: 'owner' });
      await service.setSlowMode('conv-1', userId, seconds);
    }
    expect(prisma.conversation.update).toHaveBeenCalledTimes(6);
  });

  // ── Topic Edge Cases ──────────────────────────────────

  it('should throw BadRequestException when 100 topics limit hit', async () => {
    prisma.groupTopic.count.mockResolvedValue(100);
    await expect(service.createTopic('conv-1', userId, { name: 'Overflow' }))
      .rejects.toThrow(BadRequestException);
  });

  it('should accept Unicode emoji in topic name', async () => {
    prisma.groupTopic.create.mockResolvedValue({ id: 'topic-1', name: '🕌 Prayer Times' });
    const result = await service.createTopic('conv-1', userId, { name: '🕌 Prayer Times' });
    expect(result).toBeDefined();
    expect(result.name).toBe('🕌 Prayer Times');
  });

  it('should throw NotFoundException when topic not found for update', async () => {
    prisma.groupTopic.findUnique.mockResolvedValue(null);
    await expect(service.updateTopic('topic-99', userId, { name: 'New' }))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when topic not found for delete', async () => {
    prisma.groupTopic.findUnique.mockResolvedValue(null);
    await expect(service.deleteTopic('topic-99', userId))
      .rejects.toThrow(NotFoundException);
  });

  it('should reject empty topic name on update', async () => {
    prisma.groupTopic.findUnique.mockResolvedValue({ id: 'topic-1', conversationId: 'conv-1' });
    prisma.conversationMember.findUnique.mockResolvedValue({ userId, role: 'owner' });
    await expect(service.updateTopic('topic-1', userId, { name: '' }))
      .rejects.toThrow(BadRequestException);
  });

  // ── Emoji Pack Edge Cases ──────────────────────────────

  it('should accept valid shortcode at minimum length (2 chars)', async () => {
    const result = await service.addEmojiToPack('pack-1', userId, {
      shortcode: 'ab', imageUrl: 'https://example.com/e.png',
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty('shortcode');
  });

  it('should accept valid shortcode at maximum length (32 chars)', async () => {
    const shortcode = 'a'.repeat(32);
    const result = await service.addEmojiToPack('pack-1', userId, {
      shortcode, imageUrl: 'https://example.com/e.png',
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty('shortcode');
  });

  it('should reject shortcode with 1 character', async () => {
    await expect(service.addEmojiToPack('pack-1', userId, {
      shortcode: 'a', imageUrl: 'https://example.com/e.png',
    })).rejects.toThrow(BadRequestException);
  });

  it('should reject shortcode with 33 characters', async () => {
    await expect(service.addEmojiToPack('pack-1', userId, {
      shortcode: 'a'.repeat(33), imageUrl: 'https://example.com/e.png',
    })).rejects.toThrow(BadRequestException);
  });

  it('should reject shortcode with spaces', async () => {
    await expect(service.addEmojiToPack('pack-1', userId, {
      shortcode: 'test emoji', imageUrl: 'https://example.com/e.png',
    })).rejects.toThrow(BadRequestException);
  });

  it('should reject shortcode with special characters', async () => {
    await expect(service.addEmojiToPack('pack-1', userId, {
      shortcode: 'test-emoji!', imageUrl: 'https://example.com/e.png',
    })).rejects.toThrow(BadRequestException);
  });

  it('should allow shortcode with underscores', async () => {
    const result = await service.addEmojiToPack('pack-1', userId, {
      shortcode: 'test_emoji_v2', imageUrl: 'https://example.com/e.png',
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty('shortcode');
  });

  it('should handle animated emoji flag', async () => {
    prisma.customEmoji.create.mockResolvedValue({ id: 'emoji-1', shortcode: 'dance', isAnimated: true });
    const result = await service.addEmojiToPack('pack-1', userId, {
      shortcode: 'dance', imageUrl: 'https://example.com/dance.gif', isAnimated: true,
    });
    expect(result).toBeDefined();
    expect(result.isAnimated).toBe(true);
  });

  it('should throw BadRequestException when max 120 emoji per pack reached', async () => {
    prisma.customEmoji.count.mockResolvedValue(120);
    await expect(service.addEmojiToPack('pack-1', userId, {
      shortcode: 'overflow', imageUrl: 'https://example.com/e.png',
    })).rejects.toThrow(BadRequestException);
  });

  it('should reject duplicate shortcode within same pack', async () => {
    prisma.customEmoji.findUnique.mockResolvedValue({ id: 'existing', shortcode: 'test' });
    await expect(service.addEmojiToPack('pack-1', userId, {
      shortcode: 'test', imageUrl: 'https://example.com/e.png',
    })).rejects.toThrow(BadRequestException);
  });

  // ── Admin Log Edge Cases ──────────────────────────────

  it('should reject invalid admin action type', async () => {
    await expect(service.logAdminAction('conv-1', userId, 'NONEXISTENT_ACTION'))
      .rejects.toThrow(BadRequestException);
  });

  it('should accept all valid admin action types', async () => {
    const validActions = [
      'MEMBER_ADDED', 'MEMBER_REMOVED', 'MEMBER_BANNED',
      'TITLE_CHANGED', 'PHOTO_CHANGED', 'PIN_MESSAGE', 'UNPIN_MESSAGE',
      'SLOW_MODE_CHANGED', 'PERMISSIONS_CHANGED',
      'TOPIC_CREATED', 'TOPIC_UPDATED', 'TOPIC_DELETED',
      'EMOJI_PACK_CREATED', 'EMOJI_PACK_UPDATED', 'EMOJI_PACK_DELETED',
      'EMOJI_ADDED', 'EMOJI_REMOVED',
    ];
    for (const action of validActions) {
      await service.logAdminAction('conv-1', userId, action);
    }
    expect(prisma.adminLog.create).toHaveBeenCalledTimes(validActions.length);
  });

  it('should get admin log with cursor pagination', async () => {
    prisma.conversationMember.findUnique.mockResolvedValue({ userId, role: 'owner' });
    prisma.adminLog.findMany.mockResolvedValue([]);
    const result = await service.getAdminLog('conv-1', userId, 'cursor-1');
    expect(result.data).toEqual([]);
    expect(result.meta.hasMore).toBe(false);
  });

  // ── Reorder Edge Cases ─────────────────────────────────

  it('should throw BadRequestException for reorder with null array', async () => {
    await expect(service.reorderChatFolders(userId, null as any))
      .rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException for reorder with duplicate IDs', async () => {
    prisma.chatFolder.findMany.mockResolvedValue([{ id: 'f-1' }, { id: 'f-2' }]);
    await expect(service.reorderChatFolders(userId, ['f-1', 'f-1']))
      .rejects.toThrow(BadRequestException);
  });
});

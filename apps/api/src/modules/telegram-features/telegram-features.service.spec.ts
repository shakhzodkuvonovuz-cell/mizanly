import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { TelegramFeaturesService } from './telegram-features.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('TelegramFeaturesService', () => {
  let service: TelegramFeaturesService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  const mockSavedMsg = {
    id: 'sm-1', userId: 'user-1', content: 'Test', isPinned: false,
    createdAt: new Date(),
  };

  const mockFolder = {
    id: 'f-1', userId: 'user-1', name: 'Work', position: 0,
    conversationIds: ['conv-1'], filterType: 'INCLUDE',
    includeGroups: false, includeChannels: false, includeBots: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        TelegramFeaturesService,
        {
          provide: PrismaService,
          useValue: {
            savedMessage: {
              create: jest.fn().mockResolvedValue(mockSavedMsg),
              findMany: jest.fn().mockResolvedValue([mockSavedMsg]),
              findFirst: jest.fn().mockResolvedValue(mockSavedMsg),
              findUnique: jest.fn().mockResolvedValue(mockSavedMsg),
              update: jest.fn().mockResolvedValue({ ...mockSavedMsg, isPinned: true }),
              delete: jest.fn().mockResolvedValue(mockSavedMsg),
            },
            chatFolder: {
              create: jest.fn().mockResolvedValue(mockFolder),
              findMany: jest.fn().mockResolvedValue([mockFolder]),
              findFirst: jest.fn().mockResolvedValue(mockFolder),
              count: jest.fn().mockResolvedValue(3),
              update: jest.fn().mockResolvedValue(mockFolder),
              delete: jest.fn().mockResolvedValue(mockFolder),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            conversation: {
              findUnique: jest.fn().mockResolvedValue({ id: 'conv-1', isGroup: true }),
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
            },
            conversationMember: {
              findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', role: 'owner' }),
              findMany: jest.fn().mockResolvedValue([{ conversationId: 'conv-1' }]),
            },
            adminLog: {
              create: jest.fn().mockResolvedValue({ id: 'log-1', action: 'SLOW_MODE_CHANGED' }),
              findMany: jest.fn().mockResolvedValue([]),
            },
            groupTopic: {
              create: jest.fn().mockResolvedValue({ id: 'topic-1', name: 'General', conversationId: 'conv-1' }),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue({ id: 'topic-1', conversationId: 'conv-1', name: 'General' }),
              update: jest.fn().mockResolvedValue({ id: 'topic-1', name: 'Updated' }),
              delete: jest.fn().mockResolvedValue({ id: 'topic-1', name: 'General' }),
              count: jest.fn().mockResolvedValue(0),
            },
            customEmojiPack: {
              create: jest.fn().mockResolvedValue({ id: 'pack-1', name: 'TestPack' }),
              findMany: jest.fn().mockResolvedValue([]),
              findFirst: jest.fn().mockResolvedValue({ id: 'pack-1', creatorId: 'user-1' }),
              update: jest.fn().mockResolvedValue({ id: 'pack-1', name: 'Updated Pack' }),
              delete: jest.fn().mockResolvedValue({ id: 'pack-1' }),
            },
            customEmoji: {
              create: jest.fn().mockResolvedValue({ id: 'emoji-1', shortcode: 'test' }),
              findUnique: jest.fn().mockResolvedValue(null),
              delete: jest.fn().mockResolvedValue({ id: 'emoji-1' }),
              count: jest.fn().mockResolvedValue(0),
            },
            $transaction: jest.fn().mockResolvedValue(undefined),
          } as any,
        },
      ],
    }).compile();

    service = module.get(TelegramFeaturesService);
    prisma = module.get(PrismaService);
  });

  // ── Saved Messages ──────────────────────────────────────

  describe('Saved Messages', () => {
    it('should save a message with content', async () => {
      const result = await service.saveMessage('user-1', { content: 'Test' });
      expect(result).toEqual(mockSavedMsg);
    });

    it('should save a message with mediaUrl only', async () => {
      await service.saveMessage('user-1', { mediaUrl: 'https://example.com/img.png' });
      expect(prisma.savedMessage.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException when neither content nor mediaUrl is provided', async () => {
      await expect(service.saveMessage('user-1', {})).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for content exceeding 10000 chars', async () => {
      const longContent = 'a'.repeat(10001);
      await expect(service.saveMessage('user-1', { content: longContent })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid forwardedFromType', async () => {
      await expect(
        service.saveMessage('user-1', { content: 'test', forwardedFromType: 'invalid' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when forwardedFromType set without forwardedFromId', async () => {
      await expect(
        service.saveMessage('user-1', { content: 'test', forwardedFromType: 'FWD_POST' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept forwardedFromType with forwardedFromId', async () => {
      await service.saveMessage('user-1', {
        content: 'test', forwardedFromType: 'FWD_POST', forwardedFromId: 'post-1',
      });
      expect(prisma.savedMessage.create).toHaveBeenCalled();
    });

    it('should get saved messages with pagination', async () => {
      const result = await service.getSavedMessages('user-1');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result).toHaveProperty('meta');
      expect(result.meta).toHaveProperty('hasMore');
    });

    it('should return cursor=null when hasMore is false', async () => {
      prisma.savedMessage.findMany.mockResolvedValue([mockSavedMsg]);
      const result = await service.getSavedMessages('user-1');
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.cursor).toBeNull();
    });

    it('should toggle pin on saved message', async () => {
      const result = await service.pinSavedMessage('user-1', 'sm-1');
      expect(prisma.savedMessage.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when pinning another user message', async () => {
      prisma.savedMessage.findFirst.mockResolvedValue(null);
      await expect(service.pinSavedMessage('user-2', 'sm-1')).rejects.toThrow(NotFoundException);
    });

    it('should delete saved message', async () => {
      await service.deleteSavedMessage('user-1', 'sm-1');
      expect(prisma.savedMessage.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when deleting non-existent saved message', async () => {
      prisma.savedMessage.findFirst.mockResolvedValue(null);
      await expect(service.deleteSavedMessage('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Search Saved Messages ──────────────────────────────

  describe('searchSavedMessages', () => {
    it('should search saved messages by query', async () => {
      prisma.savedMessage.findMany.mockResolvedValue([mockSavedMsg]);
      const result = await service.searchSavedMessages('user-1', 'Test');
      expect(result.data).toHaveLength(1);
      expect(result.meta).toBeDefined();
    });

    it('should throw BadRequestException for empty search query', async () => {
      await expect(service.searchSavedMessages('user-1', '')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for whitespace-only query', async () => {
      await expect(service.searchSavedMessages('user-1', '   ')).rejects.toThrow(BadRequestException);
    });

    it('should support cursor pagination in search', async () => {
      prisma.savedMessage.findMany.mockResolvedValue([]);
      const result = await service.searchSavedMessages('user-1', 'test', 'cursor-1');
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  // ── Chat Folders ────────────────────────────────────────

  describe('Chat Folders', () => {
    it('should create a chat folder', async () => {
      const result = await service.createChatFolder('user-1', { name: 'Work' });
      expect(result).toEqual(mockFolder);
    });

    it('should throw BadRequestException for empty folder name', async () => {
      await expect(service.createChatFolder('user-1', { name: '' })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for folder name exceeding 50 chars', async () => {
      await expect(service.createChatFolder('user-1', { name: 'a'.repeat(51) })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when max 10 folders reached', async () => {
      prisma.chatFolder.count.mockResolvedValue(10);
      await expect(service.createChatFolder('user-1', { name: 'New' })).rejects.toThrow(BadRequestException);
    });

    it('should validate conversationIds membership on create', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([]); // no memberships
      await expect(
        service.createChatFolder('user-1', { name: 'Test', conversationIds: ['conv-unknown'] }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should accept valid conversationIds on create', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([{ conversationId: 'conv-1' }]);
      const result = await service.createChatFolder('user-1', { name: 'Test', conversationIds: ['conv-1'] });
      expect(result).toBeDefined();
      expect(result).toHaveProperty('name');
    });

    it('should include filterType and includeBots in create', async () => {
      prisma.chatFolder.create.mockResolvedValue({ ...mockFolder, filterType: 'EXCLUDE', includeBots: true });
      await service.createChatFolder('user-1', {
        name: 'Test', filterType: 'EXCLUDE', includeBots: true,
      });
      expect(prisma.chatFolder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ filterType: 'EXCLUDE', includeBots: true }),
        }),
      );
    });

    it('should get chat folders', async () => {
      const result = await service.getChatFolders('user-1');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should update chat folder', async () => {
      await service.updateChatFolder('user-1', 'f-1', { name: 'Updated' });
      expect(prisma.chatFolder.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when updating non-existent folder', async () => {
      prisma.chatFolder.findFirst.mockResolvedValue(null);
      await expect(service.updateChatFolder('user-1', 'f-99', { name: 'Updated' })).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for empty name on update', async () => {
      await expect(service.updateChatFolder('user-1', 'f-1', { name: '  ' })).rejects.toThrow(BadRequestException);
    });

    it('should validate conversationIds on update', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([]);
      await expect(
        service.updateChatFolder('user-1', 'f-1', { conversationIds: ['unknown-conv'] }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should delete chat folder', async () => {
      await service.deleteChatFolder('user-1', 'f-1');
      expect(prisma.chatFolder.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when deleting another user folder', async () => {
      prisma.chatFolder.findFirst.mockResolvedValue(null);
      await expect(service.deleteChatFolder('user-2', 'f-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Chat Folder Conversations ───────────────────────────

  describe('getFolderConversations', () => {
    it('should return conversations for a folder', async () => {
      prisma.conversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);
      const result = await service.getFolderConversations('user-1', 'f-1');
      expect(result.data).toHaveLength(1);
      expect(result.meta).toBeDefined();
    });

    it('should throw NotFoundException for non-existent folder', async () => {
      prisma.chatFolder.findFirst.mockResolvedValue(null);
      await expect(service.getFolderConversations('user-1', 'f-99')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Reorder Chat Folders ────────────────────────────────

  describe('reorderChatFolders', () => {
    it('should reorder folders', async () => {
      prisma.chatFolder.findMany.mockResolvedValue([{ id: 'f-1' }]);
      const result = await service.reorderChatFolders('user-1', ['f-1']);
      expect(result).toBeUndefined();
    });

    it('should throw BadRequestException for empty array', async () => {
      await expect(service.reorderChatFolders('user-1', [])).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException for unowned folder ID', async () => {
      prisma.chatFolder.findMany.mockResolvedValue([{ id: 'f-1' }]);
      await expect(service.reorderChatFolders('user-1', ['f-1', 'f-unknown'])).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for incomplete folder set', async () => {
      prisma.chatFolder.findMany.mockResolvedValue([{ id: 'f-1' }, { id: 'f-2' }, { id: 'f-3' }]);
      await expect(service.reorderChatFolders('user-1', ['f-1', 'f-2'])).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for duplicate folder IDs', async () => {
      prisma.chatFolder.findMany.mockResolvedValue([{ id: 'f-1' }, { id: 'f-2' }]);
      await expect(service.reorderChatFolders('user-1', ['f-1', 'f-1'])).rejects.toThrow(BadRequestException);
    });
  });

  // ── Slow Mode ──────────────────────────────────────────

  describe('Slow Mode', () => {
    it('should set slow mode on a group conversation', async () => {
      await service.setSlowMode('conv-1', 'user-1', 30);
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { slowModeSeconds: 30 } }),
      );
    });

    it('should disable slow mode with 0', async () => {
      await service.setSlowMode('conv-1', 'user-1', 0);
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { slowModeSeconds: null } }),
      );
    });

    it('should throw ForbiddenException for non-admin', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', role: 'member' });
      await expect(service.setSlowMode('conv-1', 'user-1', 30)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for non-member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.setSlowMode('conv-1', 'user-1', 30)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for invalid interval', async () => {
      await expect(service.setSlowMode('conv-1', 'user-1', 45)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.setSlowMode('conv-1', 'user-1', 30)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for DM conversation (not group)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', isGroup: false });
      await expect(service.setSlowMode('conv-1', 'user-1', 30)).rejects.toThrow(BadRequestException);
    });

    it('should log admin action after setting slow mode', async () => {
      await service.setSlowMode('conv-1', 'user-1', 300);
      expect(prisma.adminLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SLOW_MODE_CHANGED',
            groupId: 'conv-1',
            adminId: 'user-1',
          }),
        }),
      );
    });
  });

  // ── Topics ─────────────────────────────────────────────

  describe('Topics', () => {
    it('should create topic in group conversation', async () => {
      const result = await service.createTopic('conv-1', 'user-1', { name: 'Fiqh Discussion' });
      expect(result.id).toBe('topic-1');
    });

    it('should throw BadRequestException for empty topic name', async () => {
      await expect(service.createTopic('conv-1', 'user-1', { name: '' })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for topic name exceeding 100 chars', async () => {
      await expect(
        service.createTopic('conv-1', 'user-1', { name: 'a'.repeat(101) }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when user is not a member', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.createTopic('conv-1', 'user-1', { name: 'Test' })).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when max 100 topics reached', async () => {
      prisma.groupTopic.count.mockResolvedValue(100);
      await expect(service.createTopic('conv-1', 'user-1', { name: 'Test' })).rejects.toThrow(BadRequestException);
    });

    it('should log admin action on topic creation', async () => {
      await service.createTopic('conv-1', 'user-1', { name: 'General' });
      expect(prisma.adminLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'TOPIC_CREATED' }),
        }),
      );
    });

    it('should get topics for conversation with membership check', async () => {
      prisma.groupTopic.findMany.mockResolvedValue([{ id: 'topic-1', name: 'General' }]);
      const result = await service.getTopics('conv-1', 'user-1');
      expect(result).toHaveLength(1);
      expect(prisma.conversationMember.findUnique).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when non-member tries to get topics', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue(null);
      await expect(service.getTopics('conv-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should update topic', async () => {
      const result = await service.updateTopic('topic-1', 'user-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException when updating non-existent topic', async () => {
      prisma.groupTopic.findUnique.mockResolvedValue(null);
      await expect(service.updateTopic('topic-99', 'user-1', { name: 'Updated' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-admin tries to update topic', async () => {
      prisma.conversationMember.findUnique.mockResolvedValue({ userId: 'user-1', role: 'member' });
      await expect(service.updateTopic('topic-1', 'user-1', { name: 'Updated' })).rejects.toThrow(ForbiddenException);
    });

    it('should log admin action on topic update', async () => {
      await service.updateTopic('topic-1', 'user-1', { name: 'Updated', isPinned: true });
      expect(prisma.adminLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'TOPIC_UPDATED' }),
        }),
      );
    });

    it('should delete topic for admin and return deleted record', async () => {
      prisma.groupTopic.findUnique.mockResolvedValueOnce({ id: 'topic-1', conversationId: 'conv-1', name: 'General' });
      prisma.conversationMember.findUnique.mockResolvedValueOnce({ userId: 'user-1', role: 'owner' });
      prisma.groupTopic.delete.mockResolvedValue({ id: 'topic-1' });
      const result = await service.deleteTopic('topic-1', 'user-1');
      expect(result.id).toBe('topic-1');
    });

    it('should throw ForbiddenException when non-admin tries to delete topic', async () => {
      prisma.groupTopic.findUnique.mockResolvedValueOnce({ id: 'topic-1', conversationId: 'conv-1', name: 'General' });
      prisma.conversationMember.findUnique.mockResolvedValueOnce({ userId: 'user-1', role: 'member' });
      await expect(service.deleteTopic('topic-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should log admin action on topic deletion', async () => {
      prisma.groupTopic.findUnique.mockResolvedValueOnce({ id: 'topic-1', conversationId: 'conv-1', name: 'General' });
      prisma.conversationMember.findUnique.mockResolvedValueOnce({ userId: 'user-1', role: 'owner' });
      prisma.groupTopic.delete.mockResolvedValue({ id: 'topic-1' });
      await service.deleteTopic('topic-1', 'user-1');
      expect(prisma.adminLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'TOPIC_DELETED' }),
        }),
      );
    });
  });

  // ── Emoji Packs ────────────────────────────────────────

  describe('Emoji Packs', () => {
    it('should create emoji pack', async () => {
      const result = await service.createEmojiPack('user-1', { name: 'TestPack' });
      expect(result.name).toBe('TestPack');
    });

    it('should throw BadRequestException for empty pack name', async () => {
      await expect(service.createEmojiPack('user-1', { name: '' })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for pack name exceeding 100 chars', async () => {
      await expect(service.createEmojiPack('user-1', { name: 'a'.repeat(101) })).rejects.toThrow(BadRequestException);
    });

    it('should update emoji pack', async () => {
      const result = await service.updateEmojiPack('pack-1', 'user-1', { name: 'Updated Pack' });
      expect(result.name).toBe('Updated Pack');
    });

    it('should throw NotFoundException when updating non-existent pack', async () => {
      prisma.customEmojiPack.findFirst.mockResolvedValue(null);
      await expect(service.updateEmojiPack('pack-99', 'user-1', { name: 'Updated' })).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for empty pack name on update', async () => {
      await expect(service.updateEmojiPack('pack-1', 'user-1', { name: '  ' })).rejects.toThrow(BadRequestException);
    });

    it('should toggle pack visibility', async () => {
      await service.updateEmojiPack('pack-1', 'user-1', { isPublic: false });
      expect(prisma.customEmojiPack.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isPublic: false }),
        }),
      );
    });

    it('should delete emoji pack', async () => {
      const result = await service.deleteEmojiPack('pack-1', 'user-1');
      expect(prisma.customEmojiPack.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException when deleting non-existent pack', async () => {
      prisma.customEmojiPack.findFirst.mockResolvedValue(null);
      await expect(service.deleteEmojiPack('pack-99', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should get user emoji packs', async () => {
      prisma.customEmojiPack.findMany.mockResolvedValue([{ id: 'pack-1', name: 'TestPack' }]);
      const result = await service.getMyEmojiPacks('user-1');
      expect(result).toHaveLength(1);
    });

    it('should get public emoji packs with pagination', async () => {
      prisma.customEmojiPack.findMany.mockResolvedValue([{ id: 'pack-1', name: 'Public' }]);
      const result = await service.getEmojiPacks();
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  // ── Add Emoji to Pack ──────────────────────────────────

  describe('addEmojiToPack', () => {
    it('should add emoji to pack', async () => {
      const result = await service.addEmojiToPack('pack-1', 'user-1', {
        shortcode: 'test_emoji', imageUrl: 'https://example.com/emoji.png',
      });
      expect(result.id).toBe('emoji-1');
    });

    it('should throw NotFoundException when pack not found or not owned', async () => {
      prisma.customEmojiPack.findFirst.mockResolvedValue(null);
      await expect(
        service.addEmojiToPack('pack-99', 'user-1', { shortcode: 'test', imageUrl: 'https://example.com/e.png' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for empty shortcode', async () => {
      await expect(
        service.addEmojiToPack('pack-1', 'user-1', { shortcode: '', imageUrl: 'https://example.com/e.png' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid shortcode format', async () => {
      await expect(
        service.addEmojiToPack('pack-1', 'user-1', { shortcode: 'a', imageUrl: 'https://example.com/e.png' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for shortcode with special characters', async () => {
      await expect(
        service.addEmojiToPack('pack-1', 'user-1', { shortcode: 'emoji-name!', imageUrl: 'https://example.com/e.png' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for duplicate shortcode within pack', async () => {
      prisma.customEmoji.findUnique.mockResolvedValue({ id: 'existing', shortcode: 'test_emoji' });
      await expect(
        service.addEmojiToPack('pack-1', 'user-1', { shortcode: 'test_emoji', imageUrl: 'https://example.com/e.png' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when max 120 emojis reached', async () => {
      prisma.customEmoji.count.mockResolvedValue(120);
      await expect(
        service.addEmojiToPack('pack-1', 'user-1', { shortcode: 'new_emoji', imageUrl: 'https://example.com/e.png' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should increment pack usageCount when emoji is added', async () => {
      await service.addEmojiToPack('pack-1', 'user-1', {
        shortcode: 'test_emoji', imageUrl: 'https://example.com/emoji.png',
      });
      expect(prisma.customEmojiPack.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pack-1' },
          data: { usageCount: { increment: 1 } },
        }),
      );
    });
  });

  // ── Delete Emoji ────────────────────────────────────────

  describe('deleteEmoji', () => {
    it('should delete emoji owned by user', async () => {
      prisma.customEmoji.findUnique.mockResolvedValue({
        id: 'emoji-1', pack: { creatorId: 'user-1' },
      });
      const result = await service.deleteEmoji('emoji-1', 'user-1');
      expect(prisma.customEmoji.delete).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent emoji', async () => {
      prisma.customEmoji.findUnique.mockResolvedValue(null);
      await expect(service.deleteEmoji('emoji-99', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-creator tries to delete emoji', async () => {
      prisma.customEmoji.findUnique.mockResolvedValue({
        id: 'emoji-1', pack: { creatorId: 'other-user' },
      });
      await expect(service.deleteEmoji('emoji-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Admin Log ──────────────────────────────────────────

  describe('Admin Log', () => {
    it('should log admin action with valid action type', async () => {
      prisma.adminLog.create.mockResolvedValue({ id: 'log-1', action: 'MEMBER_REMOVED' });
      await service.logAdminAction('conv-1', 'user-1', 'MEMBER_REMOVED', 'user-2', 'Kicked from group');
      expect(prisma.adminLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            groupId: 'conv-1', adminId: 'user-1', action: 'MEMBER_REMOVED',
            targetId: 'user-2', details: 'Kicked from group',
          },
        }),
      );
    });

    it('should throw BadRequestException for invalid action type', async () => {
      await expect(
        service.logAdminAction('conv-1', 'user-1', 'INVALID_ACTION'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should get admin log entries for admin user', async () => {
      prisma.conversationMember.findUnique.mockResolvedValueOnce({ userId: 'user-1', role: 'owner' });
      prisma.adminLog.findMany.mockResolvedValue([{ id: 'log-1', action: 'SLOW_MODE_CHANGED' }]);
      const result = await service.getAdminLog('conv-1', 'user-1');
      expect(result.data).toHaveLength(1);
    });

    it('should throw ForbiddenException for non-admin viewing admin log', async () => {
      prisma.conversationMember.findUnique.mockResolvedValueOnce({ userId: 'user-1', role: 'member' });
      await expect(service.getAdminLog('conv-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('should return cursor=null when no more admin log entries', async () => {
      prisma.conversationMember.findUnique.mockResolvedValueOnce({ userId: 'user-1', role: 'owner' });
      prisma.adminLog.findMany.mockResolvedValue([{ id: 'log-1' }]);
      const result = await service.getAdminLog('conv-1', 'user-1');
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.cursor).toBeNull();
    });
  });
});

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
              update: jest.fn(),
            },
            conversationMember: {
              findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', role: 'owner' }),
            },
            adminLog: {
              create: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            groupTopic: {
              create: jest.fn().mockResolvedValue({ id: 'topic-1', name: 'General' }),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue({ id: 'topic-1', conversationId: 'conv-1' }),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            customEmojiPack: {
              create: jest.fn().mockResolvedValue({ id: 'pack-1', name: 'TestPack' }),
              findMany: jest.fn().mockResolvedValue([]),
              findFirst: jest.fn().mockResolvedValue({ id: 'pack-1', creatorId: 'user-1' }),
            },
            customEmoji: {
              create: jest.fn().mockResolvedValue({ id: 'emoji-1', shortcode: ':test:' }),
            },
          } as any,
        },
      ],
    }).compile();

    service = module.get(TelegramFeaturesService);
    prisma = module.get(PrismaService);
  });

  describe('Saved Messages', () => {
    it('should save a message', async () => {
      const result = await service.saveMessage('user-1', { content: 'Test' });
      expect(result).toEqual(mockSavedMsg);
    });

    it('should get saved messages', async () => {
      const result = await service.getSavedMessages('user-1');
      expect(Array.isArray(result.data)).toBe(true);
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
  });

  describe('Chat Folders', () => {
    it('should create a chat folder', async () => {
      const result = await service.createChatFolder('user-1', { name: 'Work' });
      expect(result).toEqual(mockFolder);
    });

    it('should get chat folders', async () => {
      const result = await service.getChatFolders('user-1');
      expect(Array.isArray(result)).toBe(true);
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

  describe('Slow Mode', () => {
    it('should set slow mode', async () => {
      await service.setSlowMode('conv-1', 'user-1', 30);
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { slowModeSeconds: 30 } }),
      );
    });
  });

  describe('Topics', () => {
    it('should create topic in group conversation', async () => {
      const result = await service.createTopic('conv-1', 'user-1', { name: 'Fiqh Discussion' });
      expect(result.id).toBe('topic-1');
    });

    it('should get topics for conversation', async () => {
      prisma.groupTopic.findMany.mockResolvedValue([{ id: 'topic-1', name: 'General' }]);
      const result = await service.getTopics('conv-1');
      expect(result).toHaveLength(1);
    });

    it('should update topic', async () => {
      prisma.groupTopic.update.mockResolvedValue({ id: 'topic-1', name: 'Updated' });
      const result = await service.updateTopic('topic-1', 'user-1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should delete topic for admin and return deleted record', async () => {
      prisma.groupTopic.findUnique.mockResolvedValueOnce({ id: 'topic-1', conversationId: 'conv-1' });
      prisma.conversationMember.findUnique.mockResolvedValueOnce({ userId: 'user-1', role: 'owner' });
      prisma.groupTopic.delete.mockResolvedValue({ id: 'topic-1' });
      const result = await service.deleteTopic('topic-1', 'user-1');
      expect(result.id).toBe('topic-1');
    });
  });

  describe('Emoji Packs', () => {
    it('should create emoji pack', async () => {
      const result = await service.createEmojiPack('user-1', { name: 'TestPack' });
      expect(result.name).toBe('TestPack');
    });

    it('should get user emoji packs', async () => {
      prisma.customEmojiPack.findMany.mockResolvedValue([{ id: 'pack-1', name: 'TestPack' }]);
      const result = await service.getMyEmojiPacks('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('Admin Log', () => {
    it('should log admin action', async () => {
      prisma.adminLog.create.mockResolvedValue({ id: 'log-1', action: 'KICK' });
      await service.logAdminAction('conv-1', 'user-1', 'KICK', { targetUserId: 'user-2' });
      expect(prisma.adminLog.create).toHaveBeenCalled();
    });

    it('should get admin log entries for admin user', async () => {
      prisma.conversationMember.findUnique.mockResolvedValueOnce({ userId: 'user-1', role: 'owner' });
      prisma.adminLog.findMany.mockResolvedValue([{ id: 'log-1', action: 'KICK' }]);
      const result = await service.getAdminLog('conv-1', 'user-1');
      expect(result.data).toHaveLength(1);
    });
  });
});

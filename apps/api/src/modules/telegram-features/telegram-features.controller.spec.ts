import { Test, TestingModule } from '@nestjs/testing';
import { TelegramFeaturesController } from './telegram-features.controller';
import { TelegramFeaturesService } from './telegram-features.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('TelegramFeaturesController', () => {
  let controller: TelegramFeaturesController;
  let service: jest.Mocked<TelegramFeaturesService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramFeaturesController],
      providers: [
        ...globalMockProviders,
        {
          provide: TelegramFeaturesService,
          useValue: {
            searchSavedMessages: jest.fn(),
            getSavedMessages: jest.fn(),
            saveMessage: jest.fn(),
            pinSavedMessage: jest.fn(),
            deleteSavedMessage: jest.fn(),
            reorderChatFolders: jest.fn(),
            getChatFolders: jest.fn(),
            getFolderConversations: jest.fn(),
            createChatFolder: jest.fn(),
            updateChatFolder: jest.fn(),
            deleteChatFolder: jest.fn(),
            setSlowMode: jest.fn(),
            getAdminLog: jest.fn(),
            createTopic: jest.fn(),
            getTopics: jest.fn(),
            updateTopic: jest.fn(),
            deleteTopic: jest.fn(),
            getMyEmojiPacks: jest.fn(),
            createEmojiPack: jest.fn(),
            updateEmojiPack: jest.fn(),
            deleteEmojiPack: jest.fn(),
            addEmojiToPack: jest.fn(),
            deleteEmoji: jest.fn(),
            getEmojiPacks: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(TelegramFeaturesController);
    service = module.get(TelegramFeaturesService) as jest.Mocked<TelegramFeaturesService>;
  });

  afterEach(() => jest.clearAllMocks());

  // ── Saved Messages ──────────────────────────────────────

  describe('getSavedMessages', () => {
    it('should call service.getSavedMessages with userId and cursor', async () => {
      service.getSavedMessages.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);
      await controller.getSavedMessages(userId, 'cursor-1');
      expect(service.getSavedMessages).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });

  describe('saveMessage', () => {
    it('should call service.saveMessage with userId and dto', async () => {
      const dto = { content: 'Note to self' };
      service.saveMessage.mockResolvedValue({ id: 'msg-1' } as any);
      await controller.saveMessage(userId, dto as any);
      expect(service.saveMessage).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('searchSavedMessages', () => {
    it('should call service.searchSavedMessages with userId, query, and cursor', async () => {
      service.searchSavedMessages.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);
      await controller.searchSavedMessages(userId, 'test query', 'cursor-1');
      expect(service.searchSavedMessages).toHaveBeenCalledWith(userId, 'test query', 'cursor-1');
    });
  });

  describe('pinSavedMessage', () => {
    it('should call service.pinSavedMessage with userId and id', async () => {
      service.pinSavedMessage.mockResolvedValue({ id: 'sm-1', isPinned: true } as any);
      await controller.pinSavedMessage(userId, 'sm-1');
      expect(service.pinSavedMessage).toHaveBeenCalledWith(userId, 'sm-1');
    });
  });

  describe('deleteSavedMessage', () => {
    it('should call service.deleteSavedMessage with userId and id', async () => {
      service.deleteSavedMessage.mockResolvedValue({ id: 'sm-1' } as any);
      await controller.deleteSavedMessage(userId, 'sm-1');
      expect(service.deleteSavedMessage).toHaveBeenCalledWith(userId, 'sm-1');
    });
  });

  // ── Chat Folders ────────────────────────────────────────

  describe('getChatFolders', () => {
    it('should call service.getChatFolders with userId', async () => {
      service.getChatFolders.mockResolvedValue([{ id: 'f-1', name: 'Work' }] as any);
      await controller.getChatFolders(userId);
      expect(service.getChatFolders).toHaveBeenCalledWith(userId);
    });
  });

  describe('createChatFolder', () => {
    it('should call service.createChatFolder with userId and dto', async () => {
      const dto = { name: 'Family', conversationIds: ['c-1'] };
      service.createChatFolder.mockResolvedValue({ id: 'f-1' } as any);
      await controller.createChatFolder(userId, dto as any);
      expect(service.createChatFolder).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('updateChatFolder', () => {
    it('should call service.updateChatFolder with userId, id, and dto', async () => {
      const dto = { name: 'Updated Folder' };
      service.updateChatFolder.mockResolvedValue({ id: 'f-1' } as any);
      await controller.updateChatFolder(userId, 'f-1', dto as any);
      expect(service.updateChatFolder).toHaveBeenCalledWith(userId, 'f-1', dto);
    });
  });

  describe('deleteChatFolder', () => {
    it('should call service.deleteChatFolder with userId and id', async () => {
      service.deleteChatFolder.mockResolvedValue({ id: 'f-1' } as any);
      await controller.deleteChatFolder(userId, 'f-1');
      expect(service.deleteChatFolder).toHaveBeenCalledWith(userId, 'f-1');
    });
  });

  describe('reorderChatFolders', () => {
    it('should call service.reorderChatFolders with userId and folderIds', async () => {
      const dto = { folderIds: ['f-2', 'f-1'] };
      service.reorderChatFolders.mockResolvedValue(undefined as any);
      await controller.reorderChatFolders(userId, dto as any);
      expect(service.reorderChatFolders).toHaveBeenCalledWith(userId, ['f-2', 'f-1']);
    });
  });

  describe('getFolderConversations', () => {
    it('should call service.getFolderConversations with userId, folderId, and cursor', async () => {
      service.getFolderConversations.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);
      await controller.getFolderConversations(userId, 'f-1', 'cursor-1');
      expect(service.getFolderConversations).toHaveBeenCalledWith(userId, 'f-1', 'cursor-1');
    });
  });

  // ── Slow Mode ──────────────────────────────────────────

  describe('setSlowMode', () => {
    it('should call service.setSlowMode with conversationId, userId, and seconds', async () => {
      service.setSlowMode.mockResolvedValue({ slowModeSeconds: 30 } as any);
      await controller.setSlowMode(userId, 'conv-1', { seconds: 30 } as any);
      expect(service.setSlowMode).toHaveBeenCalledWith('conv-1', userId, 30);
    });
  });

  // ── Admin Log ──────────────────────────────────────────

  describe('getAdminLog', () => {
    it('should call service.getAdminLog with conversationId, userId, and cursor', async () => {
      service.getAdminLog.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);
      await controller.getAdminLog(userId, 'conv-1', 'cursor-1');
      expect(service.getAdminLog).toHaveBeenCalledWith('conv-1', userId, 'cursor-1');
    });
  });

  // ── Group Topics ────────────────────────────────────────

  describe('createTopic', () => {
    it('should call service.createTopic with conversationId, userId, and dto', async () => {
      const dto = { name: 'General Discussion' };
      service.createTopic.mockResolvedValue({ id: 'topic-1' } as any);
      await controller.createTopic(userId, 'conv-1', dto as any);
      expect(service.createTopic).toHaveBeenCalledWith('conv-1', userId, dto);
    });
  });

  describe('getTopics', () => {
    it('should call service.getTopics with conversationId and userId', async () => {
      service.getTopics.mockResolvedValue([{ id: 'topic-1' }] as any);
      await controller.getTopics(userId, 'conv-1');
      expect(service.getTopics).toHaveBeenCalledWith('conv-1', userId);
    });
  });

  describe('updateTopic', () => {
    it('should call service.updateTopic with id, userId, and dto', async () => {
      const dto = { name: 'Updated Topic' };
      service.updateTopic.mockResolvedValue({ id: 'topic-1' } as any);
      await controller.updateTopic(userId, 'topic-1', dto as any);
      expect(service.updateTopic).toHaveBeenCalledWith('topic-1', userId, dto);
    });
  });

  describe('deleteTopic', () => {
    it('should call service.deleteTopic with id and userId', async () => {
      service.deleteTopic.mockResolvedValue({ id: 'topic-1' } as any);
      await controller.deleteTopic(userId, 'topic-1');
      expect(service.deleteTopic).toHaveBeenCalledWith('topic-1', userId);
    });
  });

  // ── Custom Emoji Packs ──────────────────────────────────

  describe('createEmojiPack', () => {
    it('should call service.createEmojiPack with userId and dto', async () => {
      const dto = { name: 'My Pack', description: 'Custom emojis' };
      service.createEmojiPack.mockResolvedValue({ id: 'pack-1' } as any);
      await controller.createEmojiPack(userId, dto as any);
      expect(service.createEmojiPack).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('updateEmojiPack', () => {
    it('should call service.updateEmojiPack with id, userId, and dto', async () => {
      const dto = { name: 'Updated Pack' };
      service.updateEmojiPack.mockResolvedValue({ id: 'pack-1' } as any);
      await controller.updateEmojiPack(userId, 'pack-1', dto as any);
      expect(service.updateEmojiPack).toHaveBeenCalledWith('pack-1', userId, dto);
    });
  });

  describe('deleteEmojiPack', () => {
    it('should call service.deleteEmojiPack with id and userId', async () => {
      service.deleteEmojiPack.mockResolvedValue({ id: 'pack-1' } as any);
      await controller.deleteEmojiPack(userId, 'pack-1');
      expect(service.deleteEmojiPack).toHaveBeenCalledWith('pack-1', userId);
    });
  });

  describe('addEmoji', () => {
    it('should call service.addEmojiToPack with packId, userId, and dto', async () => {
      const dto = { shortcode: 'test_emoji', imageUrl: 'https://example.com/emoji.png' };
      service.addEmojiToPack.mockResolvedValue({ id: 'emoji-1' } as any);
      await controller.addEmoji(userId, 'pack-1', dto as any);
      expect(service.addEmojiToPack).toHaveBeenCalledWith('pack-1', userId, dto);
    });
  });

  describe('deleteEmoji', () => {
    it('should call service.deleteEmoji with id and userId', async () => {
      service.deleteEmoji.mockResolvedValue({ id: 'emoji-1' } as any);
      await controller.deleteEmoji(userId, 'emoji-1');
      expect(service.deleteEmoji).toHaveBeenCalledWith('emoji-1', userId);
    });
  });

  describe('getEmojiPacks', () => {
    it('should call service.getEmojiPacks with cursor', async () => {
      service.getEmojiPacks.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);
      await controller.getEmojiPacks('cursor-1');
      expect(service.getEmojiPacks).toHaveBeenCalledWith('cursor-1');
    });
  });

  describe('getMyEmojiPacks', () => {
    it('should call service.getMyEmojiPacks with userId', async () => {
      service.getMyEmojiPacks.mockResolvedValue([] as any);
      await controller.getMyEmojiPacks(userId);
      expect(service.getMyEmojiPacks).toHaveBeenCalledWith(userId);
    });
  });
});

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
            addEmojiToPack: jest.fn(),
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

  describe('getSavedMessages', () => {
    it('should call service.getSavedMessages with userId and cursor', async () => {
      service.getSavedMessages.mockResolvedValue({ data: [] } as any);

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

  describe('setSlowMode', () => {
    it('should call service.setSlowMode with conversationId, userId, and seconds', async () => {
      service.setSlowMode.mockResolvedValue({ slowModeSeconds: 30 } as any);

      await controller.setSlowMode(userId, 'conv-1', { seconds: 30 } as any);

      expect(service.setSlowMode).toHaveBeenCalledWith('conv-1', userId, 30);
    });
  });

  describe('getAdminLog', () => {
    it('should call service.getAdminLog with conversationId, userId, and cursor', async () => {
      service.getAdminLog.mockResolvedValue({ data: [] } as any);

      await controller.getAdminLog(userId, 'conv-1', 'cursor-1');

      expect(service.getAdminLog).toHaveBeenCalledWith('conv-1', userId, 'cursor-1');
    });
  });

  describe('createTopic', () => {
    it('should call service.createTopic with conversationId, userId, and dto', async () => {
      const dto = { name: 'General Discussion' };
      service.createTopic.mockResolvedValue({ id: 'topic-1' } as any);

      await controller.createTopic(userId, 'conv-1', dto as any);

      expect(service.createTopic).toHaveBeenCalledWith('conv-1', userId, dto);
    });
  });

  describe('createEmojiPack', () => {
    it('should call service.createEmojiPack with userId and dto', async () => {
      const dto = { name: 'My Pack', description: 'Custom emojis' };
      service.createEmojiPack.mockResolvedValue({ id: 'pack-1' } as any);

      await controller.createEmojiPack(userId, dto as any);

      expect(service.createEmojiPack).toHaveBeenCalledWith(userId, dto);
    });
  });
});

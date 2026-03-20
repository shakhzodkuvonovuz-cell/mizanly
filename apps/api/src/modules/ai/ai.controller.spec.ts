import { Test, TestingModule } from '@nestjs/testing';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('AiController', () => {
  let controller: AiController;
  let service: jest.Mocked<AiService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        ...globalMockProviders,
        {
          provide: AiService,
          useValue: {
            suggestCaptions: jest.fn(),
            suggestHashtags: jest.fn(),
            suggestPostingTime: jest.fn(),
            translateText: jest.fn(),
            moderateContent: jest.fn(),
            suggestSmartReplies: jest.fn(),
            summarizeContent: jest.fn(),
            routeToSpace: jest.fn(),
            generateVideoCaptions: jest.fn(),
            getVideoCaptions: jest.fn(),
            generateAvatar: jest.fn(),
            getUserAvatars: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(AiController);
    service = module.get(AiService) as jest.Mocked<AiService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('suggestCaptions', () => {
    it('should call aiService.suggestCaptions with content and mediaDescription', async () => {
      const mockCaptions = [{ caption: 'Beautiful sunset', tone: 'casual' }];
      service.suggestCaptions.mockResolvedValue(mockCaptions as any);

      const result = await controller.suggestCaptions({ content: 'sunset photo', mediaDescription: 'A sunset over the ocean' });

      expect(service.suggestCaptions).toHaveBeenCalledWith('sunset photo', 'A sunset over the ocean');
      expect(result).toEqual(mockCaptions);
    });

    it('should default to empty string when content is not provided', async () => {
      service.suggestCaptions.mockResolvedValue([] as any);

      await controller.suggestCaptions({ mediaDescription: 'test' } as any);

      expect(service.suggestCaptions).toHaveBeenCalledWith('', 'test');
    });
  });

  describe('suggestHashtags', () => {
    it('should call aiService.suggestHashtags with content', async () => {
      const mockTags = ['#sunset', '#nature', '#photography'];
      service.suggestHashtags.mockResolvedValue(mockTags as any);

      const result = await controller.suggestHashtags({ content: 'Beautiful nature photo' });

      expect(service.suggestHashtags).toHaveBeenCalledWith('Beautiful nature photo');
      expect(result).toEqual(mockTags);
    });
  });

  describe('suggestPostingTime', () => {
    it('should call aiService.suggestPostingTime with userId', async () => {
      const mockTime = { bestTime: '18:00', timezone: 'UTC', reason: 'Peak engagement' };
      service.suggestPostingTime.mockResolvedValue(mockTime as any);

      const result = await controller.suggestPostingTime(userId);

      expect(service.suggestPostingTime).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockTime);
    });
  });

  describe('translate', () => {
    it('should call aiService.translateText with all dto fields', async () => {
      const mockTranslation = { translatedText: 'Bonjour', sourceLang: 'en', targetLang: 'fr' };
      service.translateText.mockResolvedValue(mockTranslation as any);

      const dto = { text: 'Hello', targetLanguage: 'fr', contentId: 'post-1', contentType: 'post' };
      const result = await controller.translate(dto as any);

      expect(service.translateText).toHaveBeenCalledWith('Hello', 'fr', 'post-1', 'post');
      expect(result).toEqual(expect.objectContaining({ translatedText: 'Bonjour' }));
    });
  });

  describe('moderate', () => {
    it('should call aiService.moderateContent with text and contentType', async () => {
      const mockResult = { safe: true, flags: [], confidence: 0.98, suggestion: null, category: null };
      service.moderateContent.mockResolvedValue(mockResult as any);

      const result = await controller.moderate({ text: 'Normal post content', contentType: 'post' } as any);

      expect(service.moderateContent).toHaveBeenCalledWith('Normal post content', 'post');
      expect(result).toEqual(expect.objectContaining({ safe: true }));
    });
  });

  describe('smartReplies', () => {
    it('should call aiService.suggestSmartReplies with conversation context', async () => {
      const mockReplies = [{ text: 'Sounds great!', tone: 'friendly' }];
      service.suggestSmartReplies.mockResolvedValue(mockReplies as any);

      const dto = { conversationContext: 'casual chat', lastMessages: ['How are you?'] };
      const result = await controller.smartReplies(dto as any);

      expect(service.suggestSmartReplies).toHaveBeenCalledWith('casual chat', ['How are you?']);
      expect(result).toEqual(mockReplies);
    });
  });

  describe('summarize', () => {
    it('should call aiService.summarizeContent with text and maxLength', async () => {
      const mockSummary = { summary: 'Short summary of long article' };
      service.summarizeContent.mockResolvedValue(mockSummary as any);

      const result = await controller.summarize({ text: 'Very long text...', maxLength: 100 } as any);

      expect(service.summarizeContent).toHaveBeenCalledWith('Very long text...', 100);
      expect(result).toEqual(mockSummary);
    });
  });

  describe('routeSpace', () => {
    it('should call aiService.routeToSpace with content and mediaTypes', async () => {
      const mockRouting = { recommendedSpace: 'SAF', confidence: 0.9, reason: 'Photo content' };
      service.routeToSpace.mockResolvedValue(mockRouting as any);

      const result = await controller.routeSpace({ content: 'Check this out', mediaTypes: ['image'] } as any);

      expect(service.routeToSpace).toHaveBeenCalledWith('Check this out', ['image']);
      expect(result).toEqual(expect.objectContaining({ recommendedSpace: 'SAF' }));
    });
  });

  describe('generateCaptions', () => {
    it('should call aiService.generateVideoCaptions with videoId, audioUrl, language', async () => {
      const mockCaptions = { id: 'cap-1', videoId: 'vid-1', language: 'en', srt: 'subtitle data' };
      service.generateVideoCaptions.mockResolvedValue(mockCaptions as any);

      const result = await controller.generateCaptions('vid-1', { audioUrl: 'https://audio.url', language: 'en' } as any);

      expect(service.generateVideoCaptions).toHaveBeenCalledWith('vid-1', 'https://audio.url', 'en');
      expect(result).toEqual(expect.objectContaining({ videoId: 'vid-1' }));
    });
  });

  describe('getCaptions', () => {
    it('should call aiService.getVideoCaptions with videoId and language', async () => {
      const mockCaptions = { videoId: 'vid-1', language: 'en', srt: 'subtitle data' };
      service.getVideoCaptions.mockResolvedValue(mockCaptions as any);

      const result = await controller.getCaptions('vid-1', 'ar');

      expect(service.getVideoCaptions).toHaveBeenCalledWith('vid-1', 'ar');
      expect(result).toEqual(expect.objectContaining({ videoId: 'vid-1' }));
    });

    it('should default language to en when not provided', async () => {
      service.getVideoCaptions.mockResolvedValue({} as any);

      await controller.getCaptions('vid-1');

      expect(service.getVideoCaptions).toHaveBeenCalledWith('vid-1', 'en');
    });
  });

  describe('generateAvatar', () => {
    it('should call aiService.generateAvatar with userId, sourceUrl, style', async () => {
      const mockAvatar = { id: 'av-1', url: 'https://avatar.url', style: 'anime' };
      service.generateAvatar.mockResolvedValue(mockAvatar as any);

      const result = await controller.generateAvatar(userId, { sourceUrl: 'https://photo.url', style: 'anime' } as any);

      expect(service.generateAvatar).toHaveBeenCalledWith(userId, 'https://photo.url', 'anime');
      expect(result).toEqual(expect.objectContaining({ style: 'anime' }));
    });

    it('should default style to "default" when not provided', async () => {
      service.generateAvatar.mockResolvedValue({} as any);

      await controller.generateAvatar(userId, { sourceUrl: 'https://photo.url' } as any);

      expect(service.generateAvatar).toHaveBeenCalledWith(userId, 'https://photo.url', 'default');
    });
  });

  describe('getUserAvatars', () => {
    it('should call aiService.getUserAvatars with userId', async () => {
      const mockAvatars = [{ id: 'av-1', url: 'https://avatar.url' }];
      service.getUserAvatars.mockResolvedValue(mockAvatars as any);

      const result = await controller.getUserAvatars(userId);

      expect(service.getUserAvatars).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockAvatars);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CommunityController', () => {
  let controller: CommunityController;
  let service: jest.Mocked<CommunityService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunityController],
      providers: [
        ...globalMockProviders,
        {
          provide: CommunityService,
          useValue: {
            createBoard: jest.fn(),
            getBoards: jest.fn(),
            requestMentorship: jest.fn(),
            respondMentorship: jest.fn(),
            getMyMentorships: jest.fn(),
            createStudyCircle: jest.fn(),
            getStudyCircles: jest.fn(),
            askFatwa: jest.fn(),
            getFatwaQuestions: jest.fn(),
            answerFatwa: jest.fn(),
            createOpportunity: jest.fn(),
            getOpportunities: jest.fn(),
            createEvent: jest.fn(),
            getEvents: jest.fn(),
            getReputation: jest.fn(),
            createVoicePost: jest.fn(),
            getVoicePosts: jest.fn(),
            createWatchParty: jest.fn(),
            getActiveWatchParties: jest.fn(),
            createCollection: jest.fn(),
            getMyCollections: jest.fn(),
            createWaqf: jest.fn(),
            getWaqfFunds: jest.fn(),
            checkKindness: jest.fn(),
            getDataExport: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(CommunityController);
    service = module.get(CommunityService) as jest.Mocked<CommunityService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('createBoard', () => {
    it('should call communityService.createBoard with userId and dto', async () => {
      const dto = { name: 'London Muslims', city: 'London' };
      service.createBoard.mockResolvedValue({ id: 'board-1' } as any);

      const result = await controller.createBoard(userId, dto as any);

      expect(service.createBoard).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'board-1' }));
    });
  });

  describe('getBoards', () => {
    it('should call communityService.getBoards with city, country, cursor', async () => {
      service.getBoards.mockResolvedValue({ data: [] } as any);

      await controller.getBoards('London', 'UK', 'cursor-1');

      expect(service.getBoards).toHaveBeenCalledWith('London', 'UK', 'cursor-1');
    });
  });

  describe('requestMentorship', () => {
    it('should call communityService.requestMentorship with userId and dto', async () => {
      const dto = { mentorId: 'user-2', topic: 'Quran memorization' };
      service.requestMentorship.mockResolvedValue({ id: 'ms-1' } as any);

      await controller.requestMentorship(userId, dto as any);

      expect(service.requestMentorship).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('createStudyCircle', () => {
    it('should call communityService.createStudyCircle with userId and dto', async () => {
      const dto = { name: 'Tajweed Basics', topic: 'QURAN' };
      service.createStudyCircle.mockResolvedValue({ id: 'sc-1' } as any);

      await controller.createStudyCircle(userId, dto as any);

      expect(service.createStudyCircle).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('askFatwa', () => {
    it('should call communityService.askFatwa with userId and dto', async () => {
      const dto = { question: 'Is this halal?', madhab: 'hanafi' };
      service.askFatwa.mockResolvedValue({ id: 'fatwa-1' } as any);

      await controller.askFatwa(userId, dto as any);

      expect(service.askFatwa).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('answerFatwa', () => {
    it('should call communityService.answerFatwa with userId, id, answer', async () => {
      service.answerFatwa.mockResolvedValue({ answered: true } as any);

      await controller.answerFatwa(userId, 'fatwa-1', { answer: 'Yes, this is halal because...' } as any);

      expect(service.answerFatwa).toHaveBeenCalledWith(userId, 'fatwa-1', 'Yes, this is halal because...');
    });
  });

  describe('createVoicePost', () => {
    it('should call communityService.createVoicePost with userId and dto', async () => {
      const dto = { audioUrl: 'https://audio.url', duration: 120 };
      service.createVoicePost.mockResolvedValue({ id: 'vp-1' } as any);

      await controller.createVoicePost(userId, dto as any);

      expect(service.createVoicePost).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('createWatchParty', () => {
    it('should call communityService.createWatchParty with userId and dto', async () => {
      const dto = { videoId: 'vid-1', title: 'Friday Night Lecture' };
      service.createWatchParty.mockResolvedValue({ id: 'wp-1' } as any);

      await controller.createWatchParty(userId, dto as any);

      expect(service.createWatchParty).toHaveBeenCalledWith(userId, dto);
    });
  });

  describe('getActiveWatchParties', () => {
    it('should call communityService.getActiveWatchParties', async () => {
      service.getActiveWatchParties.mockResolvedValue([{ id: 'wp-1' }] as any);

      const result = await controller.getActiveWatchParties();

      expect(service.getActiveWatchParties).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('checkKindness', () => {
    it('should call communityService.checkKindness with text', async () => {
      service.checkKindness.mockResolvedValue({ needsRephrase: false } as any);

      const result = await controller.checkKindness({ text: 'Great post!' } as any);

      expect(service.checkKindness).toHaveBeenCalledWith('Great post!');
      expect(result).toEqual({ needsRephrase: false });
    });
  });

  describe('getDataExport', () => {
    it('should call communityService.getDataExport with userId', async () => {
      service.getDataExport.mockResolvedValue({ url: 'https://export.url' } as any);

      const result = await controller.getDataExport(userId);

      expect(service.getDataExport).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ url: expect.any(String) }));
    });
  });
});

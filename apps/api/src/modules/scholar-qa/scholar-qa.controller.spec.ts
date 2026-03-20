import { Test, TestingModule } from '@nestjs/testing';
import { ScholarQAController } from './scholar-qa.controller';
import { ScholarQAService } from './scholar-qa.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ScholarQAController', () => {
  let controller: ScholarQAController;
  let service: jest.Mocked<ScholarQAService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScholarQAController],
      providers: [
        ...globalMockProviders,
        {
          provide: ScholarQAService,
          useValue: {
            schedule: jest.fn(),
            getUpcoming: jest.fn(),
            getRecordings: jest.fn(),
            getById: jest.fn(),
            submitQuestion: jest.fn(),
            voteQuestion: jest.fn(),
            startSession: jest.fn(),
            endSession: jest.fn(),
            markAnswered: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ScholarQAController);
    service = module.get(ScholarQAService) as jest.Mocked<ScholarQAService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('schedule', () => {
    it('should call scholarQAService.schedule with scholarId and dto', async () => {
      const dto = { title: 'Fiqh Q&A', category: 'fiqh', scheduledAt: '2026-04-01T10:00:00Z' };
      service.schedule.mockResolvedValue({ id: 'qa-1' } as any);

      const result = await controller.schedule(userId, dto as any);

      expect(service.schedule).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'qa-1' }));
    });
  });

  describe('getUpcoming', () => {
    it('should call scholarQAService.getUpcoming', async () => {
      service.getUpcoming.mockResolvedValue([{ id: 'qa-1' }] as any);

      const result = await controller.getUpcoming();

      expect(service.getUpcoming).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('getRecordings', () => {
    it('should call scholarQAService.getRecordings', async () => {
      service.getRecordings.mockResolvedValue([{ id: 'qa-1', recordingUrl: 'url' }] as any);

      await controller.getRecordings();

      expect(service.getRecordings).toHaveBeenCalled();
    });
  });

  describe('submitQuestion', () => {
    it('should call scholarQAService.submitQuestion with userId, qaId, and question', async () => {
      service.submitQuestion.mockResolvedValue({ id: 'q-1' } as any);

      await controller.submitQuestion(userId, 'qa-1', { question: 'Is it halal?' } as any);

      expect(service.submitQuestion).toHaveBeenCalledWith(userId, 'qa-1', 'Is it halal?');
    });
  });

  describe('voteQuestion', () => {
    it('should call scholarQAService.voteQuestion with userId and questionId', async () => {
      service.voteQuestion.mockResolvedValue({ voted: true } as any);

      await controller.voteQuestion(userId, 'q-1');

      expect(service.voteQuestion).toHaveBeenCalledWith(userId, 'q-1');
    });
  });

  describe('startSession', () => {
    it('should call scholarQAService.startSession with scholarId and qaId', async () => {
      service.startSession.mockResolvedValue({ started: true } as any);

      await controller.startSession(userId, 'qa-1');

      expect(service.startSession).toHaveBeenCalledWith(userId, 'qa-1');
    });
  });

  describe('endSession', () => {
    it('should call scholarQAService.endSession with scholarId and qaId', async () => {
      service.endSession.mockResolvedValue({ ended: true } as any);

      await controller.endSession(userId, 'qa-1');

      expect(service.endSession).toHaveBeenCalledWith(userId, 'qa-1');
    });
  });
});

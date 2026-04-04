import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PollsController } from './polls.controller';
import { PollsService } from './polls.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PollsController', () => {
  let controller: PollsController;
  let service: jest.Mocked<PollsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PollsController],
      providers: [
        ...globalMockProviders,
        {
          provide: PollsService,
          useValue: {
            getPoll: jest.fn(),
            vote: jest.fn(),
            retractVote: jest.fn(),
            getVoters: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(PollsController);
    service = module.get(PollsService) as jest.Mocked<PollsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getPoll', () => {
    it('should call pollsService.getPoll with pollId and userId', async () => {
      service.getPoll.mockResolvedValue({ id: 'poll-1', question: 'Favorite prayer?' } as any);

      const result = await controller.getPoll('poll-1', userId);

      expect(service.getPoll).toHaveBeenCalledWith('poll-1', userId);
      expect(result).toEqual(expect.objectContaining({ question: 'Favorite prayer?' }));
    });
  });

  describe('vote', () => {
    it('should call pollsService.vote with pollId, optionId, and userId', async () => {
      service.vote.mockResolvedValue({ voted: true } as any);

      await controller.vote('poll-1', { optionId: 'opt-1' } as any, userId);

      expect(service.vote).toHaveBeenCalledWith('poll-1', 'opt-1', userId);
    });
  });

  describe('retractVote', () => {
    it('should call pollsService.retractVote with pollId and userId', async () => {
      service.retractVote.mockResolvedValue(undefined as any);

      await controller.retractVote('poll-1', userId);

      expect(service.retractVote).toHaveBeenCalledWith('poll-1', userId);
    });
  });

  describe('getVoters', () => {
    it('should call pollsService.getVoters with pollId, optionId, userId, and cursor', async () => {
      service.getVoters.mockResolvedValue({ data: [] } as any);

      await controller.getVoters('poll-1', 'opt-1', userId, 'cursor-1');

      expect(service.getVoters).toHaveBeenCalledWith('poll-1', 'opt-1', userId, 'cursor-1');
    });

    it('should throw BadRequestException when optionId is missing', async () => {
      await expect(controller.getVoters('poll-1', '', userId, undefined)).rejects.toThrow(BadRequestException);
    });
  });
});

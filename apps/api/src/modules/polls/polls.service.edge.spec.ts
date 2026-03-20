import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PollsService } from './polls.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PollsService — edge cases', () => {
  let service: PollsService;
  let prisma: any;
  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        PollsService,
        {
          provide: PrismaService,
          useValue: {
            poll: { findUnique: jest.fn(), update: jest.fn() },
            pollOption: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
            pollVote: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), delete: jest.fn() },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PollsService>(PollsService);
    prisma = module.get(PrismaService);
  });

  it('should throw NotFoundException for non-existent poll', async () => {
    prisma.poll.findUnique.mockResolvedValue(null);
    await expect(service.getPoll('nonexistent'))
      .rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when voting on expired poll', async () => {
    prisma.poll.findUnique.mockResolvedValue({
      id: 'poll-1',
      endsAt: new Date(Date.now() - 86400000), // expired yesterday
      options: [{ id: 'opt-1' }],
    });
    await expect(service.vote('poll-1', 'opt-1', userId))
      .rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException for non-existent poll when voting', async () => {
    prisma.poll.findUnique.mockResolvedValue(null);
    await expect(service.vote('nonexistent', 'opt-1', userId))
      .rejects.toThrow(NotFoundException);
  });

  it('should return poll with Arabic question text', async () => {
    const arabicPoll = {
      id: 'poll-1',
      question: 'هل تصوم يوم الاثنين؟',
      endsAt: new Date(Date.now() + 86400000),
      totalVotes: 0,
      allowMultiple: false,
      options: [
        { id: 'opt-1', text: 'نعم', position: 0, votesCount: 0, _count: { votes: 0 } },
        { id: 'opt-2', text: 'لا', position: 1, votesCount: 0, _count: { votes: 0 } },
      ],
    };
    prisma.poll.findUnique.mockResolvedValue(arabicPoll);
    const result = await service.getPoll('poll-1');
    expect(result.question).toBe('هل تصوم يوم الاثنين؟');
  });

  it('should throw BadRequestException when retracting non-existent vote', async () => {
    prisma.poll.findUnique.mockResolvedValue({
      id: 'poll-1',
      endsAt: new Date(Date.now() + 86400000),
    });
    prisma.pollVote.findFirst.mockResolvedValue(null);
    await expect(service.retractVote('poll-1', userId))
      .rejects.toThrow(BadRequestException);
  });

  it('should return voters list (empty for 0 votes)', async () => {
    prisma.poll.findUnique.mockResolvedValue({
      id: 'poll-1',
      options: [{ id: 'opt-1', text: 'Yes', votesCount: 0 }],
    });
    prisma.pollVote.findMany.mockResolvedValue([]);
    const result = await service.getVoters('poll-1', 'opt-1');
    expect(result.data).toEqual([]);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PollsService } from './polls.service';

describe('PollsService', () => {
  let service: PollsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PollsService,
        {
          provide: PrismaService,
          useValue: {
            poll: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            pollOption: {
              update: jest.fn(),
            },
            pollVote: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
              findMany: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PollsService>(PollsService);
    prisma = module.get(PrismaService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPoll', () => {
    it('should return poll with options and percentages', async () => {
      const pollId = 'poll-123';
      const mockPoll = {
        id: pollId,
        question: 'What is your favorite color?',
        totalVotes: 100,
        expiresAt: null,
        options: [
          { id: 'opt1', text: 'Red', votesCount: 40, position: 0 },
          { id: 'opt2', text: 'Blue', votesCount: 60, position: 1 },
        ],
        thread: { id: 'thread-1', content: 'Thread', userId: 'user-1' },
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);
      prisma.pollVote.findFirst.mockResolvedValue(null);

      const result = await service.getPoll(pollId);

      expect(prisma.poll.findUnique).toHaveBeenCalledWith({
        where: { id: pollId },
        include: {
          options: {
            orderBy: { position: 'asc' },
            select: { id: true, text: true, votesCount: true, position: true },
          },
          thread: {
            select: { id: true, content: true, userId: true },
          },
        },
      });
      expect(result.options[0].percentage).toBe(40);
      expect(result.options[1].percentage).toBe(60);
      expect(result.userVotedOptionId).toBeUndefined();
    });

    it('should include userVotedOptionId when userId provided and user voted', async () => {
      const pollId = 'poll-123';
      const userId = 'user-456';
      const mockPoll = {
        id: pollId,
        question: 'Question',
        totalVotes: 10,
        options: [{ id: 'opt1', text: 'Yes', votesCount: 10, position: 0 }],
        thread: { id: 'thread-1', content: '...', userId: 'user-1' },
      };
      const mockVote = { optionId: 'opt1' };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);
      prisma.pollVote.findFirst.mockResolvedValue(mockVote);

      const result = await service.getPoll(pollId, userId);

      expect(prisma.pollVote.findFirst).toHaveBeenCalledWith({
        where: {
          userId,
          option: { pollId },
        },
      });
      expect(result.userVotedOptionId).toBe('opt1');
    });

    it('should throw NotFoundException if poll does not exist', async () => {
      const pollId = 'poll-123';
      prisma.poll.findUnique.mockResolvedValue(null);

      await expect(service.getPoll(pollId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('vote', () => {
    it('should create a vote and increment counts', async () => {
      const pollId = 'poll-123';
      const optionId = 'opt1';
      const userId = 'user-456';
      const mockPoll = {
        id: pollId,
        options: [{ id: optionId }],
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);
      prisma.pollVote.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, {}, {}]);

      const result = await service.vote(pollId, optionId, userId);

      expect(prisma.poll.findUnique).toHaveBeenCalledWith({
        where: { id: pollId },
        include: { options: { where: { id: optionId } } },
      });
      expect(prisma.pollVote.findFirst).toHaveBeenCalledWith({
        where: {
          userId,
          option: { pollId },
        },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if poll does not exist', async () => {
      const pollId = 'poll-123';
      const optionId = 'opt1';
      const userId = 'user-456';
      prisma.poll.findUnique.mockResolvedValue(null);

      await expect(service.vote(pollId, optionId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if option does not belong to poll', async () => {
      const pollId = 'poll-123';
      const optionId = 'opt1';
      const userId = 'user-456';
      const mockPoll = {
        id: pollId,
        options: [], // empty array means option not found
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);

      await expect(service.vote(pollId, optionId, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException if user already voted', async () => {
      const pollId = 'poll-123';
      const optionId = 'opt1';
      const userId = 'user-456';
      const mockPoll = {
        id: pollId,
        options: [{ id: optionId }],
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);
      prisma.pollVote.findFirst.mockResolvedValue({ optionId: 'opt2' });

      await expect(service.vote(pollId, optionId, userId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('retractVote', () => {
    it('should delete vote and decrement counts', async () => {
      const pollId = 'poll-123';
      const userId = 'user-456';
      const mockVote = { optionId: 'opt1' };
      prisma.pollVote.findFirst.mockResolvedValue(mockVote);
      prisma.$transaction.mockResolvedValue([{}, {}, {}]);

      const result = await service.retractVote(pollId, userId);

      expect(prisma.pollVote.findFirst).toHaveBeenCalledWith({
        where: {
          userId,
          option: { pollId },
        },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should throw BadRequestException if user has not voted', async () => {
      const pollId = 'poll-123';
      const userId = 'user-456';
      prisma.pollVote.findFirst.mockResolvedValue(null);

      await expect(service.retractVote(pollId, userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getVoters', () => {
    it('should return paginated voters for an option', async () => {
      const pollId = 'poll-123';
      const optionId = 'opt1';
      const mockPoll = {
        id: pollId,
        options: [{ id: optionId }],
      };
      const mockVotes = [
        {
          user: {
            id: 'user-1',
            username: 'user1',
            displayName: 'User One',
            avatarUrl: null,
          },
          createdAt: new Date(),
        },
        {
          user: {
            id: 'user-2',
            username: 'user2',
            displayName: 'User Two',
            avatarUrl: null,
          },
          createdAt: new Date(),
        },
      ];
      prisma.poll.findUnique.mockResolvedValue(mockPoll);
      prisma.pollVote.findMany.mockResolvedValue(mockVotes);

      const result = await service.getVoters(pollId, optionId);

      expect(prisma.poll.findUnique).toHaveBeenCalledWith({
        where: { id: pollId },
        include: { options: { where: { id: optionId } } },
      });
      expect(prisma.pollVote.findMany).toHaveBeenCalledWith({
        where: { optionId },
        include: {
          user: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 21,
      });
      expect(result.data).toEqual([
        { id: 'user-1', username: 'user1', displayName: 'User One', avatarUrl: null },
        { id: 'user-2', username: 'user2', displayName: 'User Two', avatarUrl: null },
      ]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should throw NotFoundException if poll or option does not exist', async () => {
      const pollId = 'poll-123';
      const optionId = 'opt1';
      prisma.poll.findUnique.mockResolvedValue(null);

      await expect(service.getVoters(pollId, optionId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should support cursor pagination', async () => {
      const pollId = 'poll-123';
      const optionId = 'opt1';
      const cursor = 'user-1_opt1';
      const mockPoll = {
        id: pollId,
        options: [{ id: optionId }],
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);
      prisma.pollVote.findMany.mockResolvedValue([]);

      await service.getVoters(pollId, optionId, cursor);

      expect(prisma.pollVote.findMany).toHaveBeenCalledWith({
        where: { optionId },
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        take: 21,
        cursor: { userId_optionId: { userId: 'user-1', optionId: 'opt1' } },
        skip: 1,
      });
    });
  });
});
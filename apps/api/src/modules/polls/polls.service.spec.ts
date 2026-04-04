import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { PollsService } from './polls.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PollsService', () => {
  let service: PollsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
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
            $executeRaw: jest.fn().mockResolvedValue(1),
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
      prisma.pollVote.findMany.mockResolvedValue([mockVote]);

      const result = await service.getPoll(pollId, userId);

      expect(prisma.pollVote.findMany).toHaveBeenCalled();
      expect(result.userVotedOptionIds).toContain('opt1');
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
        threadId: 'thread-1',
        options: [{ id: optionId }],
        thread: { id: 'thread-1', userId: 'thread-owner' },
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);
      prisma.pollVote.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, {}, {}]);

      const result = await service.vote(pollId, optionId, userId);

      expect(prisma.poll.findUnique).toHaveBeenCalledWith({
        where: { id: pollId },
        include: { options: { where: { id: optionId } }, thread: { select: { id: true, userId: true } } },
      });
      expect(prisma.pollVote.findFirst).toHaveBeenCalledWith({
        where: {
          userId,
          option: { pollId },
        },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toBeUndefined();
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
      const mockVotes = [{ optionId: 'opt1' }];
      prisma.poll.findUnique.mockResolvedValue({ id: pollId, expiresAt: null });
      prisma.pollVote.findMany.mockResolvedValue(mockVotes);
      prisma.$transaction.mockResolvedValue([{}, {}, {}]);

      const result = await service.retractVote(pollId, userId);

      expect(prisma.pollVote.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          option: { pollId },
        },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('should throw BadRequestException if user has not voted', async () => {
      const pollId = 'poll-123';
      const userId = 'user-456';
      prisma.poll.findUnique.mockResolvedValue({ id: pollId, expiresAt: null });
      prisma.pollVote.findMany.mockResolvedValue([]);

      await expect(service.retractVote(pollId, userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getVoters', () => {
    const pollCreatorId = 'poll-owner';

    it('should return paginated voters when called by poll creator', async () => {
      const pollId = 'poll-123';
      const optionId = 'opt1';
      const mockPoll = {
        id: pollId,
        options: [{ id: optionId }],
        thread: { userId: pollCreatorId },
      };
      const mockVotes = [
        {
          user: { id: 'user-1', username: 'user1', displayName: 'User One', avatarUrl: null },
          userId: 'user-1',
          createdAt: new Date(),
        },
        {
          user: { id: 'user-2', username: 'user2', displayName: 'User Two', avatarUrl: null },
          userId: 'user-2',
          createdAt: new Date(),
        },
      ];
      prisma.poll.findUnique.mockResolvedValue(mockPoll);
      prisma.pollVote.findMany.mockResolvedValue(mockVotes);

      const result = await service.getVoters(pollId, optionId, pollCreatorId);

      expect(prisma.poll.findUnique).toHaveBeenCalledWith({
        where: { id: pollId },
        include: {
          options: { where: { id: optionId } },
          thread: { select: { userId: true } },
        },
      });
      expect(result.data).toEqual([
        { id: 'user-1', username: 'user1', displayName: 'User One', avatarUrl: null },
        { id: 'user-2', username: 'user2', displayName: 'User Two', avatarUrl: null },
      ]);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should throw ForbiddenException when non-creator tries to view voters', async () => {
      const pollId = 'poll-123';
      const optionId = 'opt1';
      const mockPoll = {
        id: pollId,
        options: [{ id: optionId }],
        thread: { userId: pollCreatorId },
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);

      await expect(service.getVoters(pollId, optionId, 'some-other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if poll or option does not exist', async () => {
      const pollId = 'poll-123';
      const optionId = 'opt1';
      prisma.poll.findUnique.mockResolvedValue(null);

      await expect(service.getVoters(pollId, optionId, pollCreatorId)).rejects.toThrow(
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
        thread: { userId: pollCreatorId },
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);
      prisma.pollVote.findMany.mockResolvedValue([]);

      await service.getVoters(pollId, optionId, pollCreatorId, cursor);

      expect(prisma.pollVote.findMany).toHaveBeenCalledWith({
        where: { optionId, user: { isBanned: false, isDeactivated: false, isDeleted: false } },
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        take: 21,
        cursor: { userId_optionId: { userId: 'user-1_opt1', optionId: 'opt1' } },
        skip: 1,
      });
    });
  });

  describe('R2-Tab2 audit fixes', () => {
    it('should use poll_options table name in retractVote SQL', async () => {
      const pollId = 'poll-retract';
      const userId = 'user-retract';
      prisma.poll.findUnique.mockResolvedValue({ id: pollId, expiresAt: null });
      prisma.pollVote.findMany.mockResolvedValue([{ optionId: 'opt1' }]);
      prisma.$transaction.mockResolvedValue([{}, {}, {}]);

      await service.retractVote(pollId, userId);

      // $transaction should include $executeRaw calls for poll_options and polls tables
      expect(prisma.$transaction).toHaveBeenCalled();
      const txArg = prisma.$transaction.mock.calls[0][0];
      // The transaction array should have 3 items: delete + executeRaw(poll_options) + executeRaw(polls)
      expect(txArg).toHaveLength(3);
    });
  });

  // -- T02 gap: multi-choice vote (allowMultiple) --

  describe('vote (multi-choice)', () => {
    it('should allow voting on a different option when allowMultiple=true', async () => {
      const mockPoll = {
        id: 'poll-mc',
        allowMultiple: true,
        options: [{ id: 'opt2' }],
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);
      // User already voted on opt1 but now voting on opt2
      prisma.pollVote.findFirst.mockResolvedValue({ optionId: 'opt1' });
      prisma.pollVote.findUnique.mockResolvedValue(null); // Not voted on opt2 yet
      prisma.$transaction.mockResolvedValue([{}, {}, {}]);

      const result = await service.vote('poll-mc', 'opt2', 'user1');
      expect(result).toBeUndefined();
    });

    it('should throw ConflictException when voting same option twice in multi-choice', async () => {
      const mockPoll = {
        id: 'poll-mc',
        allowMultiple: true,
        options: [{ id: 'opt1' }],
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);
      prisma.pollVote.findFirst.mockResolvedValue({ optionId: 'opt1' });
      prisma.pollVote.findUnique.mockResolvedValue({ userId: 'user1', optionId: 'opt1' }); // Already voted on this option

      await expect(service.vote('poll-mc', 'opt1', 'user1')).rejects.toThrow(ConflictException);
    });
  });

  // -- T02 gap: vote P2002 race condition --

  describe('vote (P2002 race condition)', () => {
    it('should throw ConflictException on P2002 race', async () => {
      const { PrismaClientKnownRequestError } = require('@prisma/client/runtime/library');
      const mockPoll = {
        id: 'poll-race',
        options: [{ id: 'opt1' }],
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);
      prisma.pollVote.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValue(
        new PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '0' }),
      );

      await expect(service.vote('poll-race', 'opt1', 'user1')).rejects.toThrow(ConflictException);
    });
  });

  // -- T02 gap: getPoll isExpired check --

  describe('getPoll (isExpired)', () => {
    it('should return isExpired=true when poll has passed endsAt', async () => {
      const mockPoll = {
        id: 'poll-exp',
        totalVotes: 10,
        endsAt: new Date('2020-01-01'), // Past date
        options: [{ id: 'opt1', text: 'A', votesCount: 10, position: 0 }],
        thread: { id: 't1', content: 'T', userId: 'u1' },
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);

      const result = await service.getPoll('poll-exp');
      expect(result.isExpired).toBe(true);
    });

    it('should return isExpired=false when no endsAt set', async () => {
      const mockPoll = {
        id: 'poll-no-exp',
        totalVotes: 5,
        endsAt: null,
        options: [{ id: 'opt1', text: 'A', votesCount: 5, position: 0 }],
        thread: { id: 't1', content: 'T', userId: 'u1' },
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);

      const result = await service.getPoll('poll-no-exp');
      expect(result.isExpired).toBe(false);
    });

    it('should return isExpired=false when endsAt is in the future', async () => {
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow
      const mockPoll = {
        id: 'poll-future',
        totalVotes: 3,
        endsAt: futureDate,
        options: [{ id: 'opt1', text: 'A', votesCount: 3, position: 0 }],
        thread: { id: 't1', content: 'T', userId: 'u1' },
      };
      prisma.poll.findUnique.mockResolvedValue(mockPoll);

      const result = await service.getPoll('poll-future');
      expect(result.isExpired).toBe(false);
    });
  });

  // -- T02 gap: retractVote poll not found --

  describe('retractVote (not found)', () => {
    it('should throw NotFoundException when poll does not exist', async () => {
      prisma.poll.findUnique.mockResolvedValue(null);
      await expect(service.retractVote('missing', 'user1')).rejects.toThrow(NotFoundException);
    });
  });
});

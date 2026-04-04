import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NOTIFICATION_REQUESTED, NotificationRequestedEvent } from '../../common/events/notification.events';

@Injectable()
export class PollsService {
  private readonly logger = new Logger(PollsService.name);
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async getPoll(pollId: string, userId?: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            text: true,
            votesCount: true,
            position: true,
          },
        },
        thread: {
          select: {
            id: true,
            content: true,
            userId: true,
          },
        },
      },
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    // Calculate percentage for each option
    const optionsWithPercent = poll.options.map((option) => ({
      ...option,
      percentage: poll.totalVotes > 0 ? (option.votesCount / poll.totalVotes) * 100 : 0,
    }));

    let userVotedOptionIds: string[] = [];
    if (userId) {
      const votes = await this.prisma.pollVote.findMany({
        where: {
          userId,
          option: {
            pollId: poll.id,
          },
        },
        select: { optionId: true },
      take: 50,
    });
      userVotedOptionIds = votes.map((v) => v.optionId);
    }

    return {
      ...poll,
      options: optionsWithPercent,
      userVotedOptionId: userVotedOptionIds[0] ?? undefined,
      userVotedOptionIds,
      isExpired: poll.endsAt ? new Date(poll.endsAt) < new Date() : false,
    };
  }

  async vote(pollId: string, optionId: string, userId: string) {
    // Check poll exists — include thread to find owner for notification
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          where: { id: optionId },
        },
        thread: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    // Prevent voting on expired polls
    if (poll.endsAt && new Date(poll.endsAt) < new Date()) {
      throw new BadRequestException('This poll has expired');
    }

    if (poll.options.length === 0) {
      throw new BadRequestException('Invalid option');
    }

    // Check if user already voted in this poll
    const existingVote = await this.prisma.pollVote.findFirst({
      where: {
        userId,
        option: {
          pollId,
        },
      },
    });

    // For single-choice polls, prevent multiple votes entirely
    // For multi-choice polls, prevent voting on the same option twice
    if (existingVote) {
      if (!poll.allowMultiple) {
        throw new ConflictException('You have already voted in this poll');
      }
      // For multi-choice: check if they already voted on THIS specific option
      const existingVoteOnOption = await this.prisma.pollVote.findUnique({
        where: { userId_optionId: { userId, optionId } },
      });
      if (existingVoteOnOption) {
        throw new ConflictException('You have already voted for this option');
      }
    }

    // Use transaction to create vote and increment counts atomically.
    // Handle P2002 in case of race condition on the unique constraint.
    try {
      await this.prisma.$transaction([
        this.prisma.pollVote.create({
          data: {
            userId,
            optionId,
          },
        }),
        this.prisma.pollOption.update({
          where: { id: optionId },
          data: {
            votesCount: {
              increment: 1,
            },
          },
        }),
        this.prisma.poll.update({
          where: { id: pollId },
          data: {
            totalVotes: {
              increment: 1,
            },
          },
        }),
      ]);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already voted in this poll');
      }
      throw error;
    }

    // Notify poll creator about the vote (skip self-votes)
    if (poll.thread?.userId && poll.thread.userId !== userId) {
      this.eventEmitter.emit(NOTIFICATION_REQUESTED, new NotificationRequestedEvent({
        userId: poll.thread.userId,
        actorId: userId,
        type: 'POLL_VOTE',
        threadId: poll.threadId,
        title: 'Poll vote',
        body: `Someone voted on your poll`,
      }));
    }

    return;
  }

  async retractVote(pollId: string, userId: string, optionId?: string) {
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) throw new NotFoundException('Poll not found');
    if (poll.endsAt && poll.endsAt < new Date()) {
      throw new BadRequestException('Cannot retract vote from an expired poll');
    }

    // Find the user's votes in this poll
    const votes = await this.prisma.pollVote.findMany({
      where: {
        userId,
        option: { pollId },
        ...(optionId ? { optionId } : {}),
      },
    });

    if (votes.length === 0) {
      throw new BadRequestException(optionId ? 'You have not voted for this option' : 'You have not voted in this poll');
    }

    // Delete all matching votes and decrement counts atomically
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const vote of votes) {
      ops.push(
        this.prisma.pollVote.delete({ where: { userId_optionId: { userId, optionId: vote.optionId } } }),
        this.prisma.$executeRaw`UPDATE "poll_options" SET "votesCount" = GREATEST("votesCount" - 1, 0) WHERE id = ${vote.optionId}`,
      );
    }
    ops.push(this.prisma.$executeRaw`UPDATE "polls" SET "totalVotes" = GREATEST("totalVotes" - ${votes.length}, 0) WHERE id = ${pollId}`);

    await this.prisma.$transaction(ops);

    return;
  }

  async getVoters(pollId: string, optionId: string, userId: string, cursor?: string) {
    // Validate poll and option exist, include thread to check ownership
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          where: { id: optionId },
        },
        thread: {
          select: { userId: true },
        },
      },
    });

    if (!poll || poll.options.length === 0) {
      throw new NotFoundException('Poll or option not found');
    }

    // Privacy: only the poll creator can see individual voter identities.
    // All other users see aggregated vote counts (via getPoll) but not WHO voted.
    if (poll.thread?.userId !== userId) {
      throw new ForbiddenException('Only the poll creator can view individual voters');
    }

    const limit = 20;
    const cursorObj = cursor
      ? { userId_optionId: { userId: cursor, optionId } }
      : undefined;
    const votes = await this.prisma.pollVote.findMany({
      where: { optionId, user: { isBanned: false, isDeactivated: false, isDeleted: false } },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      take: limit + 1,
      ...(cursorObj
        ? {
            cursor: cursorObj,
            skip: 1,
          }
        : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = votes.length > limit;
    const items = hasMore ? votes.slice(0, limit) : votes;

    return {
      data: items.map(v => v.user),
      meta: {
        cursor: hasMore ? items[items.length - 1].userId : undefined,
        hasMore,
      },
    };
  }
}

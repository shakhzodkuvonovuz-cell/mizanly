import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PollsService {
  constructor(private prisma: PrismaService) {}

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
    // Check poll exists
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          where: { id: optionId },
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

    return { success: true };
  }

  async retractVote(pollId: string, userId: string) {
    // Find the user's vote in this poll
    const vote = await this.prisma.pollVote.findFirst({
      where: {
        userId,
        option: {
          pollId,
        },
      },
    });

    if (!vote) {
      throw new BadRequestException('You have not voted in this poll');
    }

    await this.prisma.$transaction([
      this.prisma.pollVote.delete({
        where: {
          userId_optionId: {
            userId,
            optionId: vote.optionId,
          },
        },
      }),
      this.prisma.pollOption.update({
        where: { id: vote.optionId },
        data: {
          votesCount: {
            decrement: 1,
          },
        },
      }),
      this.prisma.poll.update({
        where: { id: pollId },
        data: {
          totalVotes: {
            decrement: 1,
          },
        },
      }),
    ]);

    return { success: true };
  }

  async getVoters(pollId: string, optionId: string, cursor?: string) {
    // Validate poll and option exist
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          where: { id: optionId },
        },
      },
    });

    if (!poll || poll.options.length === 0) {
      throw new NotFoundException('Poll or option not found');
    }

    const limit = 20;
    const cursorObj = cursor
      ? { userId_optionId: { userId: cursor, optionId } }
      : undefined;
    const votes = await this.prisma.pollVote.findMany({
      where: { optionId },
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
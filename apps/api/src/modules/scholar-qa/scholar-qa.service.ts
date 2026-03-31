import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ScholarQACategory, ScholarQAStatus, ScholarVerificationStatus as SVStatus } from '@prisma/client';

@Injectable()
export class ScholarQAService {
  constructor(private readonly prisma: PrismaService) {}

  async schedule(scholarId: string, data: {
    title: string;
    description?: string;
    category: string;
    language?: string;
    scheduledAt: string;
  }) {
    // Verify the user is an approved scholar
    const verification = await this.prisma.scholarVerification.findFirst({
      where: { userId: scholarId, status: 'VERIFICATION_APPROVED' },
    });
    if (!verification) {
      throw new ForbiddenException('Only verified scholars can schedule Q&A sessions');
    }

    const validCategories = ['fiqh', 'aqeedah', 'tafsir', 'seerah', 'family', 'youth', 'women', 'converts'];
    if (!validCategories.includes(data.category)) {
      throw new BadRequestException(`Category must be one of: ${validCategories.join(', ')}`);
    }

    return this.prisma.scholarQA.create({
      data: {
        scholarId,
        title: data.title,
        description: data.description,
        category: data.category as ScholarQACategory,
        language: data.language ?? 'en',
        scheduledAt: new Date(data.scheduledAt),
      },
    });
  }

  async getUpcoming() {
    // Scheduled sessions: future scheduledAt. Live sessions: any scheduledAt (already started).
    return this.prisma.scholarQA.findMany({
      where: {
        OR: [
          { status: 'QA_SCHEDULED', scheduledAt: { gte: new Date() } },
          { status: 'QA_LIVE' },
        ],
      },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    });
  }

  async getById(id: string) {
    const qa = await this.prisma.scholarQA.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { votes: 'desc' },
          take: 50,
        },
      },
    });
    if (!qa) throw new NotFoundException('Q&A session not found');
    return qa;
  }

  async submitQuestion(userId: string, qaId: string, question: string) {
    const qa = await this.prisma.scholarQA.findUnique({ where: { id: qaId } });
    if (!qa) throw new NotFoundException('Q&A session not found');
    if (qa.status === 'QA_ENDED') throw new BadRequestException('This Q&A session has ended');
    if (qa.status === 'QA_CANCELLED') throw new BadRequestException('This Q&A session was cancelled');

    return this.prisma.scholarQuestion.create({
      data: { qaId, userId, question },
    });
  }

  async voteQuestion(userId: string, questionId: string) {
    const question = await this.prisma.scholarQuestion.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException('Question not found');

    // Prevent self-voting
    if (question.userId === userId) throw new BadRequestException('Cannot vote on your own question');

    // Use ScholarQuestionVote join table for dedup
    const existingVote = await this.prisma.scholarQuestionVote.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });
    if (existingVote) throw new ConflictException('Already voted on this question');

    try {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.scholarQuestionVote.create({
          data: { userId, questionId, voteType: 'UPVOTE' },
        }),
        this.prisma.scholarQuestion.update({
          where: { id: questionId },
          data: { votes: { increment: 1 } },
        }),
      ]);
      return updated;
    } catch (err: unknown) {
      // P2002: duplicate vote from concurrent request — idempotent
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
        throw new ConflictException('Already voted on this question');
      }
      throw err;
    }
  }

  async startSession(scholarId: string, qaId: string) {
    const qa = await this.prisma.scholarQA.findUnique({ where: { id: qaId } });
    if (!qa) throw new NotFoundException('Q&A session not found');
    if (qa.scholarId !== scholarId) throw new ForbiddenException('Only the scholar can start the session');

    return this.prisma.scholarQA.update({
      where: { id: qaId },
      data: { status: 'QA_LIVE', startedAt: new Date() },
    });
  }

  async endSession(scholarId: string, qaId: string) {
    const qa = await this.prisma.scholarQA.findUnique({ where: { id: qaId } });
    if (!qa) throw new NotFoundException('Q&A session not found');
    if (qa.scholarId !== scholarId) throw new ForbiddenException('Only the scholar can end the session');

    return this.prisma.scholarQA.update({
      where: { id: qaId },
      data: { status: 'QA_ENDED', endedAt: new Date() },
    });
  }

  async markAnswered(scholarId: string, questionId: string) {
    const question = await this.prisma.scholarQuestion.findUnique({
      where: { id: questionId },
      include: { qa: true },
    });
    if (!question) throw new NotFoundException('Question not found');
    if (question.qa.scholarId !== scholarId) throw new ForbiddenException('Only the scholar can mark as answered');

    return this.prisma.scholarQuestion.update({
      where: { id: questionId },
      data: { isAnswered: true, answeredAt: new Date() },
    });
  }

  async getRecordings() {
    return this.prisma.scholarQA.findMany({
      where: { status: 'QA_ENDED', recordingUrl: { not: null } },
      orderBy: { endedAt: 'desc' },
      take: 50,
    });
  }
}

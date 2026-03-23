import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
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
      where: { userId: scholarId, status: 'VERIFICATION_PENDING' },
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
    return this.prisma.scholarQA.findMany({
      where: {
        status: { in: ['QA_SCHEDULED', 'QA_LIVE'] },
        scheduledAt: { gte: new Date() },
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

    return this.prisma.scholarQuestion.create({
      data: { qaId, userId, question },
    });
  }

  async voteQuestion(userId: string, questionId: string) {
    const question = await this.prisma.scholarQuestion.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException('Question not found');

    // Prevent self-voting
    if (question.userId === userId) throw new BadRequestException('Cannot vote on your own question');

    // Note: proper vote dedup needs a ScholarQuestionVote join table (deferred to schema file)
    return this.prisma.scholarQuestion.update({
      where: { id: questionId },
      data: { votes: { increment: 1 } },
    });
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

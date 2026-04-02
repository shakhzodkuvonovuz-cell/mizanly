import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ScholarQAService } from './scholar-qa.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ScholarQAService', () => {
  let service: ScholarQAService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ScholarQAService,
        {
          provide: PrismaService,
          useValue: {
            scholarQA: {
              create: jest.fn().mockResolvedValue({ id: 'qa-1', scholarId: 'u1', title: 'Fiqh Q&A', category: 'fiqh' }),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue({ id: 'qa-1', scholarId: 'u1', questions: [] }),
              update: jest.fn().mockResolvedValue({}),
            },
            scholarQuestion: {
              create: jest.fn().mockResolvedValue({ id: 'q-1', question: 'What is wudu?', votes: 0 }),
              findMany: jest.fn().mockResolvedValue([]),
            },
            scholarVerification: {
              findFirst: jest.fn().mockResolvedValue({ id: 'sv-1', userId: 'u1', status: 'approved' }),
            },
            $executeRaw: jest.fn().mockResolvedValue(1),
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ScholarQAService);
    prisma = module.get(PrismaService) as any;
  });

  it('should schedule a Q&A session', async () => {
    const result = await service.schedule('u1', {
      title: 'Fiqh Q&A', category: 'fiqh', language: 'en',
      scheduledAt: '2026-04-01T18:00:00Z',
    });
    expect(result.title).toBe('Fiqh Q&A');
  });

  it('should reject invalid category', async () => {
    await expect(service.schedule('u1', {
      title: 'Test', category: 'invalid', language: 'en',
      scheduledAt: '2026-04-01T18:00:00Z',
    })).rejects.toThrow(BadRequestException);
  });

  it('should get upcoming Q&A sessions', async () => {
    const result = await service.getUpcoming();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should get Q&A by ID', async () => {
    const result = await service.getById('qa-1');
    expect(result.id).toBe('qa-1');
  });

  it('should throw NotFoundException for missing Q&A', async () => {
    prisma.scholarQA.findUnique.mockResolvedValueOnce(null);
    await expect(service.getById('invalid')).rejects.toThrow(NotFoundException);
  });

  it('should submit a question', async () => {
    const result = await service.submitQuestion('u1', 'qa-1', 'What is wudu?');
    expect(result.question).toBe('What is wudu?');
  });

  describe('submitQuestion — not found', () => {
    it('should throw NotFoundException when QA session not found', async () => {
      prisma.scholarQA.findUnique.mockResolvedValueOnce(null);
      await expect(service.submitQuestion('u1', 'missing', 'test')).rejects.toThrow(NotFoundException);
    });
  });

  describe('voteQuestion', () => {
    beforeEach(() => {
      prisma.scholarQuestion.findUnique = jest.fn();
      prisma.scholarQuestion.update = jest.fn();
      prisma.scholarQuestionVote = {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      };
    });

    it('should increment vote count', async () => {
      prisma.scholarQuestion.findUnique.mockResolvedValue({ id: 'q-1', votes: 5, userId: 'other-user' });
      prisma.scholarQuestion.update.mockResolvedValue({ id: 'q-1', votes: 6 });
      prisma.$transaction.mockResolvedValue([{}, { id: 'q-1', votes: 6 }]);
      const result = await service.voteQuestion('u1', 'q-1');
      expect(result.votes).toBe(6);
    });

    it('should throw NotFoundException for missing question', async () => {
      prisma.scholarQuestion.findUnique.mockResolvedValue(null);
      await expect(service.voteQuestion('u1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('startSession', () => {
    it('should start a scheduled session', async () => {
      prisma.scholarQA.findUnique.mockResolvedValue({ id: 'qa-1', scholarId: 'u1', status: 'scheduled' });
      prisma.scholarQA.update.mockResolvedValue({ id: 'qa-1', status: 'live' });
      const result = await service.startSession('u1', 'qa-1');
      expect(result.status).toBe('live');
    });

    it('should throw NotFoundException for missing session', async () => {
      prisma.scholarQA.findUnique.mockResolvedValue(null);
      await expect(service.startSession('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-scholar', async () => {
      prisma.scholarQA.findUnique.mockResolvedValue({ id: 'qa-1', scholarId: 'other' });
      const { ForbiddenException } = require('@nestjs/common');
      await expect(service.startSession('u1', 'qa-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('endSession', () => {
    it('should end a live session', async () => {
      prisma.scholarQA.findUnique.mockResolvedValue({ id: 'qa-1', scholarId: 'u1', status: 'live' });
      prisma.scholarQA.update.mockResolvedValue({ id: 'qa-1', status: 'ended' });
      const result = await service.endSession('u1', 'qa-1');
      expect(result.status).toBe('ended');
    });

    it('should throw NotFoundException for missing session', async () => {
      prisma.scholarQA.findUnique.mockResolvedValue(null);
      await expect(service.endSession('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-scholar', async () => {
      prisma.scholarQA.findUnique.mockResolvedValue({ id: 'qa-1', scholarId: 'other' });
      const { ForbiddenException } = require('@nestjs/common');
      await expect(service.endSession('u1', 'qa-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('markAnswered', () => {
    beforeEach(() => {
      prisma.scholarQuestion.findUnique = jest.fn();
      prisma.scholarQuestion.update = jest.fn();
    });

    it('should mark question as answered', async () => {
      prisma.scholarQuestion.findUnique.mockResolvedValue({ id: 'q-1', qa: { scholarId: 'u1' } });
      prisma.scholarQuestion.update.mockResolvedValue({ id: 'q-1', isAnswered: true });
      const result = await service.markAnswered('u1', 'q-1');
      expect(result.isAnswered).toBe(true);
    });

    it('should throw NotFoundException for missing question', async () => {
      prisma.scholarQuestion.findUnique.mockResolvedValue(null);
      await expect(service.markAnswered('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-scholar', async () => {
      prisma.scholarQuestion.findUnique.mockResolvedValue({ id: 'q-1', qa: { scholarId: 'other' } });
      const { ForbiddenException } = require('@nestjs/common');
      await expect(service.markAnswered('u1', 'q-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getRecordings', () => {
    it('should return ended sessions with recordings', async () => {
      prisma.scholarQA.findMany.mockResolvedValue([
        { id: 'qa-1', status: 'ended', recordingUrl: 'https://cdn.example.com/rec.mp4' },
      ]);
      const result = await service.getRecordings();
      expect(result).toHaveLength(1);
      expect(result[0].recordingUrl).toBeDefined();
    });

    it('should return empty when no recordings', async () => {
      prisma.scholarQA.findMany.mockResolvedValue([]);
      const result = await service.getRecordings();
      expect(result).toEqual([]);
    });
  });

  describe('schedule — default language', () => {
    it('should default language to en', async () => {
      await service.schedule('u1', {
        title: 'Test', category: 'fiqh',
        scheduledAt: '2026-04-01T18:00:00Z',
      });
      expect(prisma.scholarQA.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ language: 'en' }),
      }));
    });
  });

  // T11 rows 74-77
  describe('schedule — ForbiddenException when not verified', () => {
    it('should throw ForbiddenException when scholar verification not found', async () => {
      prisma.scholarVerification.findFirst.mockResolvedValue(null);
      const { ForbiddenException } = require('@nestjs/common');
      await expect(service.schedule('u1', {
        title: 'Test', category: 'fiqh',
        scheduledAt: '2026-04-01T18:00:00Z',
      })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('voteQuestion — self-vote prevention', () => {
    beforeEach(() => {
      prisma.scholarQuestion.findUnique = jest.fn();
      prisma.scholarQuestionVote = {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      };
    });

    it('should throw BadRequestException when voting on own question', async () => {
      prisma.scholarQuestion.findUnique.mockResolvedValue({ id: 'q-1', votes: 5, userId: 'u1' });
      await expect(service.voteQuestion('u1', 'q-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('voteQuestion — ConflictException for double vote', () => {
    beforeEach(() => {
      prisma.scholarQuestion.findUnique = jest.fn();
      prisma.scholarQuestionVote = {
        findUnique: jest.fn(),
        create: jest.fn(),
      };
      prisma.scholarQuestion.update = jest.fn();
    });

    it('should throw ConflictException when already voted', async () => {
      prisma.scholarQuestion.findUnique.mockResolvedValue({ id: 'q-1', votes: 5, userId: 'other-user' });
      prisma.scholarQuestionVote.findUnique.mockResolvedValue({ userId: 'u1', questionId: 'q-1' });
      const { ConflictException } = require('@nestjs/common');
      await expect(service.voteQuestion('u1', 'q-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('voteQuestion — P2002 race condition', () => {
    beforeEach(() => {
      prisma.scholarQuestion.findUnique = jest.fn();
      prisma.scholarQuestionVote = {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      };
      prisma.scholarQuestion.update = jest.fn();
    });

    it('should throw ConflictException on P2002 duplicate', async () => {
      prisma.scholarQuestion.findUnique.mockResolvedValue({ id: 'q-1', votes: 5, userId: 'other-user' });
      const p2002 = { code: 'P2002', message: 'Unique constraint' };
      prisma.$transaction.mockRejectedValue(p2002);
      const { ConflictException } = require('@nestjs/common');
      await expect(service.voteQuestion('u1', 'q-1')).rejects.toThrow(ConflictException);
    });
  });
});

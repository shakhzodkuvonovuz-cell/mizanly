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
            $executeRaw: jest.fn().mockResolvedValue(1),
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
});

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommunityNotesService } from './community-notes.service';
import { PrismaService } from '../../config/prisma.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CommunityNotesService', () => {
  let service: CommunityNotesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        CommunityNotesService,
        {
          provide: PrismaService,
          useValue: {
            communityNote: {
              create: jest.fn().mockResolvedValue({ id: 'cn-1', authorId: 'u1', note: 'Context info' }),
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue({ id: 'cn-1', helpfulVotes: 5, notHelpfulVotes: 2 }),
              update: jest.fn().mockResolvedValue({}),
            },
            communityNoteRating: {
              findUnique: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({ noteId: 'cn-1', userId: 'u1', rating: 'helpful' }),
              upsert: jest.fn().mockResolvedValue({}),
            },
            $executeRaw: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    service = module.get(CommunityNotesService);
    prisma = module.get(PrismaService) as any;
  });

  it('should create a community note', async () => {
    const result = await service.createNote('u1', 'post', 'p1', 'Context info');
    expect(result.note).toBe('Context info');
  });

  it('should reject invalid content type', async () => {
    await expect(service.createNote('u1', 'invalid', 'p1', 'note')).rejects.toThrow(BadRequestException);
  });

  it('should get notes for content', async () => {
    const result = await service.getNotesForContent('post', 'p1');
    expect(Array.isArray(result)).toBe(true);
  });

  it('should rate a note', async () => {
    const result = await service.rateNote('u1', 'cn-1', 'helpful');
    expect(result).toBeDefined();
  });

  it('should throw on invalid rating', async () => {
    await expect(service.rateNote('u1', 'cn-1', 'invalid')).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException for missing note when rating', async () => {
    prisma.communityNote.findUnique.mockResolvedValueOnce(null);
    await expect(service.rateNote('u1', 'invalid', 'helpful')).rejects.toThrow(NotFoundException);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
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

  it('should throw ConflictException when note already rated by user', async () => {
    prisma.communityNote.findUnique.mockResolvedValue({ id: 'cn-1', helpfulVotes: 5, notHelpfulVotes: 2 });
    prisma.communityNoteRating.findUnique.mockResolvedValueOnce({ noteId: 'cn-1', userId: 'u1', rating: 'helpful' });
    await expect(service.rateNote('u1', 'cn-1', 'not_helpful')).rejects.toThrow(ConflictException);
  });

  it('should create note for thread content type', async () => {
    prisma.communityNote.create.mockResolvedValue({ id: 'cn-2', contentType: 'thread', note: 'Context' });
    const result = await service.createNote('u1', 'thread', 't1', 'Context');
    expect(result.contentType).toBe('thread');
  });

  it('should create note for reel content type', async () => {
    prisma.communityNote.create.mockResolvedValue({ id: 'cn-3', contentType: 'reel', note: 'Source' });
    const result = await service.createNote('u1', 'reel', 'r1', 'Source');
    expect(result.contentType).toBe('reel');
  });

  it('should get helpful notes only', async () => {
    prisma.communityNote.findMany.mockResolvedValue([{ id: 'cn-1', status: 'helpful' }]);
    const result = await service.getHelpfulNotes('post', 'p1');
    expect(result).toHaveLength(1);
    expect(prisma.communityNote.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { contentType: 'post', contentId: 'p1', status: 'helpful' },
    }));
  });

  it('should increment helpfulVotes for helpful rating', async () => {
    prisma.communityNote.findUnique.mockResolvedValue({ id: 'cn-1', helpfulVotes: 3, notHelpfulVotes: 1 });
    prisma.communityNoteRating.findUnique.mockResolvedValue(null);
    prisma.communityNoteRating.create.mockResolvedValue({});
    prisma.communityNote.update.mockResolvedValue({ id: 'cn-1', helpfulVotes: 4, notHelpfulVotes: 1 });

    await service.rateNote('u2', 'cn-1', 'helpful');

    expect(prisma.communityNote.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { helpfulVotes: { increment: 1 } },
    }));
  });

  it('should increment notHelpfulVotes for not_helpful rating', async () => {
    prisma.communityNote.findUnique.mockResolvedValue({ id: 'cn-1', helpfulVotes: 3, notHelpfulVotes: 1 });
    prisma.communityNoteRating.findUnique.mockResolvedValue(null);
    prisma.communityNoteRating.create.mockResolvedValue({});
    prisma.communityNote.update.mockResolvedValue({ id: 'cn-1', helpfulVotes: 3, notHelpfulVotes: 2 });

    await service.rateNote('u2', 'cn-1', 'not_helpful');

    expect(prisma.communityNote.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { notHelpfulVotes: { increment: 1 } },
    }));
  });
});

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
              create: jest.fn().mockResolvedValue({ noteId: 'cn-1', userId: 'u1', rating: 'NOTE_HELPFUL' }),
              upsert: jest.fn().mockResolvedValue({}),
            },
            post: { findUnique: jest.fn().mockResolvedValue({ id: 'p1' }), findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
            thread: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }), findFirst: jest.fn().mockResolvedValue({ id: 't1' }) },
            reel: { findUnique: jest.fn().mockResolvedValue({ id: 'r1' }), findFirst: jest.fn().mockResolvedValue({ id: 'r1' }) },
            $executeRaw: jest.fn().mockResolvedValue(1),
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CommunityNotesService);
    prisma = module.get(PrismaService) as any;
    // Make interactive $transaction pass the prisma mock as tx
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
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
    prisma.communityNote.findUnique.mockResolvedValue({ id: 'cn-1', authorId: 'other-user', helpfulVotes: 5, notHelpfulVotes: 2 });
    prisma.communityNote.update.mockResolvedValue({ id: 'cn-1', helpfulVotes: 6, notHelpfulVotes: 2 });
    const result = await service.rateNote('u1', 'cn-1', 'NOTE_HELPFUL');
    expect(prisma.communityNoteRating.create).toHaveBeenCalled();
    expect(result).toHaveProperty('rated', true);
  });

  it('should throw on invalid rating', async () => {
    await expect(service.rateNote('u1', 'cn-1', 'invalid')).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException for missing note when rating', async () => {
    prisma.communityNote.findUnique.mockResolvedValueOnce(null);
    await expect(service.rateNote('u1', 'invalid', 'NOTE_HELPFUL')).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when note already rated by user', async () => {
    prisma.communityNote.findUnique.mockResolvedValue({ id: 'cn-1', helpfulVotes: 5, notHelpfulVotes: 2 });
    prisma.communityNoteRating.findUnique.mockResolvedValueOnce({ noteId: 'cn-1', userId: 'u1', rating: 'NOTE_HELPFUL' });
    await expect(service.rateNote('u1', 'cn-1', 'NOTE_NOT_HELPFUL')).rejects.toThrow(ConflictException);
  });

  it('should create note for thread content type', async () => {
    prisma.communityNote.create.mockResolvedValue({ id: 'cn-2', contentType: 'THREAD', note: 'Context' });
    const result = await service.createNote('u1', 'thread', 't1', 'Context');
    expect(result.contentType).toBe('THREAD');
  });

  it('should create note for reel content type', async () => {
    prisma.communityNote.create.mockResolvedValue({ id: 'cn-3', contentType: 'REEL', note: 'Source' });
    const result = await service.createNote('u1', 'reel', 'r1', 'Source');
    expect(result.contentType).toBe('REEL');
  });

  it('should get helpful notes only', async () => {
    prisma.communityNote.findMany.mockResolvedValue([{ id: 'cn-1', status: 'HELPFUL' }]);
    const result = await service.getHelpfulNotes('post', 'p1');
    expect(result).toHaveLength(1);
    expect(prisma.communityNote.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { contentType: 'post', contentId: 'p1', status: 'HELPFUL' },
    }));
  });

  it('should increment helpfulVotes for helpful rating', async () => {
    prisma.communityNote.findUnique.mockResolvedValue({ id: 'cn-1', helpfulVotes: 3, notHelpfulVotes: 1 });
    prisma.communityNoteRating.findUnique.mockResolvedValue(null);
    prisma.communityNoteRating.create.mockResolvedValue({});
    prisma.communityNote.update.mockResolvedValue({ id: 'cn-1', helpfulVotes: 4, notHelpfulVotes: 1 });

    await service.rateNote('u2', 'cn-1', 'NOTE_HELPFUL');

    expect(prisma.communityNote.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { helpfulVotes: { increment: 1 } },
    }));
  });

  it('should increment notHelpfulVotes for not_helpful rating', async () => {
    prisma.communityNote.findUnique.mockResolvedValue({ id: 'cn-1', helpfulVotes: 3, notHelpfulVotes: 1 });
    prisma.communityNoteRating.findUnique.mockResolvedValue(null);
    prisma.communityNoteRating.create.mockResolvedValue({});
    prisma.communityNote.update.mockResolvedValue({ id: 'cn-1', helpfulVotes: 3, notHelpfulVotes: 2 });

    await service.rateNote('u2', 'cn-1', 'NOTE_NOT_HELPFUL');

    expect(prisma.communityNote.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { notHelpfulVotes: { increment: 1 } },
    }));
  });

  // ── W7-T1: rateNote() auto-promote threshold (T04 #30, M severity) ──
  it('should auto-promote to HELPFUL when >=5 votes and >=60% helpful', async () => {
    prisma.communityNote.findUnique.mockResolvedValue({ id: 'cn-1', authorId: 'author-x', helpfulVotes: 3, notHelpfulVotes: 1 });
    prisma.communityNoteRating.findUnique.mockResolvedValue(null);
    prisma.communityNoteRating.create.mockResolvedValue({});
    // After increment, helpfulVotes=4, notHelpfulVotes=1 => total=5, ratio=80%
    prisma.communityNote.update.mockResolvedValue({ id: 'cn-1', helpfulVotes: 4, notHelpfulVotes: 1 });

    await service.rateNote('voter-5', 'cn-1', 'NOTE_HELPFUL');

    // Should have called update twice: once for incrementing vote, once for auto-promote
    expect(prisma.communityNote.update).toHaveBeenCalledTimes(2);
    expect(prisma.communityNote.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'HELPFUL' },
    }));
  });

  it('should auto-dismiss to NOT_HELPFUL when >=5 votes and <60% helpful', async () => {
    prisma.communityNote.findUnique.mockResolvedValue({ id: 'cn-1', authorId: 'author-x', helpfulVotes: 1, notHelpfulVotes: 3 });
    prisma.communityNoteRating.findUnique.mockResolvedValue(null);
    prisma.communityNoteRating.create.mockResolvedValue({});
    // After increment, helpfulVotes=1, notHelpfulVotes=4 => total=5, ratio=20%
    prisma.communityNote.update.mockResolvedValue({ id: 'cn-1', helpfulVotes: 1, notHelpfulVotes: 4 });

    await service.rateNote('voter-5', 'cn-1', 'NOTE_NOT_HELPFUL');

    expect(prisma.communityNote.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'NOT_HELPFUL' },
    }));
  });

  // ── W7-T1: rateNote() somewhat-helpful neutral (T04 #31, M severity) ──
  it('should not increment any counter for NOTE_SOMEWHAT_HELPFUL', async () => {
    prisma.communityNote.findUnique
      .mockResolvedValueOnce({ id: 'cn-1', authorId: 'author-x', helpfulVotes: 2, notHelpfulVotes: 1 }) // for note lookup
      .mockResolvedValueOnce({ id: 'cn-1', helpfulVotes: 2, notHelpfulVotes: 1 }); // for fallback findUnique inside tx
    prisma.communityNoteRating.findUnique.mockResolvedValue(null);
    prisma.communityNoteRating.create.mockResolvedValue({});

    await service.rateNote('voter-3', 'cn-1', 'NOTE_SOMEWHAT_HELPFUL');

    // Should only call communityNote.update if needed — but for somewhat_helpful, update is not called for incrementing
    // The update calls should NOT include helpfulVotes or notHelpfulVotes increment
    const updateCalls = prisma.communityNote.update.mock.calls;
    for (const call of updateCalls) {
      expect(call[0].data).not.toHaveProperty('helpfulVotes');
      expect(call[0].data).not.toHaveProperty('notHelpfulVotes');
    }
  });

  // ── W7-T1: rateNote() self-rating prevention (T04 #47, L severity) ──
  it('should throw BadRequestException when author tries to rate own note', async () => {
    prisma.communityNote.findUnique.mockResolvedValue({ id: 'cn-1', authorId: 'u1', helpfulVotes: 2, notHelpfulVotes: 0 });
    await expect(service.rateNote('u1', 'cn-1', 'NOTE_HELPFUL')).rejects.toThrow(BadRequestException);
  });

  // ── W7-T1: createNote() thread content not found (T04 #32, M severity) ──
  it('should throw NotFoundException when thread content not found', async () => {
    prisma.thread.findFirst.mockResolvedValue(null);
    await expect(service.createNote('u1', 'thread', 'missing', 'note')).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when reel content not found', async () => {
    prisma.reel.findFirst.mockResolvedValue(null);
    await expect(service.createNote('u1', 'reel', 'missing', 'note')).rejects.toThrow(NotFoundException);
  });
});

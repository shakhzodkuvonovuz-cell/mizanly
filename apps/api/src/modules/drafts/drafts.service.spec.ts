import { Test } from '@nestjs/testing';
import { DraftsService } from './drafts.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('DraftsService', () => {
  let service: DraftsService;
  let prisma: { draftPost: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      draftPost: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        DraftsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(DraftsService);
  });

  describe('getDrafts', () => {
    it('returns drafts for user', async () => {
      prisma.draftPost.findMany.mockResolvedValue([{ id: '1' }]);
      const result = await service.getDrafts('user1');
      expect(result).toHaveLength(1);
      expect(prisma.draftPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user1' } }),
      );
    });

    it('filters by space', async () => {
      prisma.draftPost.findMany.mockResolvedValue([]);
      await service.getDrafts('user1', 'SAF');
      expect(prisma.draftPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user1', space: 'SAF' } }),
      );
    });
  });

  describe('getDraft', () => {
    it('throws NotFoundException for missing draft', async () => {
      prisma.draftPost.findUnique.mockResolvedValue(null);
      await expect(service.getDraft('bad-id', 'user1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong user', async () => {
      prisma.draftPost.findUnique.mockResolvedValue({ id: '1', userId: 'other' });
      await expect(service.getDraft('1', 'user1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('saveDraft', () => {
    it('creates a draft', async () => {
      prisma.draftPost.create.mockResolvedValue({ id: '1' });
      const result = await service.saveDraft('user1', 'SAF', { content: 'test' });
      expect(result).toEqual({ id: '1' });
    });
  });

  describe('deleteDraft', () => {
    it('deletes own draft', async () => {
      prisma.draftPost.findUnique.mockResolvedValue({ id: '1', userId: 'user1' });
      prisma.draftPost.delete.mockResolvedValue({ id: '1' });
      const result = await service.deleteDraft('1', 'user1');
      expect(result).toEqual({ deleted: true });
    });
  });
});
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ReelTemplatesService } from './reel-templates.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ReelTemplatesService', () => {
  let service: ReelTemplatesService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        ReelTemplatesService,
        {
          provide: PrismaService,
          useValue: {
            reelTemplate: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
          },
        },
      ],
    }).compile();
    service = module.get(ReelTemplatesService);
    prisma = module.get(PrismaService) as any;
  });

  describe('create', () => {
    it('should create a template', async () => {
      prisma.reelTemplate.create.mockResolvedValue({ id: 't1', name: 'My Template' });
      const result = await service.create('u1', {
        sourceReelId: 'r1', name: 'My Template', segments: [{ startMs: 0, endMs: 5000 }],
      });
      expect(result.name).toBe('My Template');
    });

    it('should throw if name empty', async () => {
      await expect(service.create('u1', { sourceReelId: 'r1', name: '', segments: [{ startMs: 0, endMs: 1000 }] }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw if no segments', async () => {
      await expect(service.create('u1', { sourceReelId: 'r1', name: 'Test', segments: [] }))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw if segment startMs >= endMs', async () => {
      await expect(service.create('u1', { sourceReelId: 'r1', name: 'Test', segments: [{ startMs: 5000, endMs: 3000 }] }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('browse', () => {
    it('should return paginated templates', async () => {
      prisma.reelTemplate.findMany.mockResolvedValue([{ id: 't1' }]);
      const result = await service.browse();
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getById', () => {
    it('should return template by id', async () => {
      prisma.reelTemplate.findUnique.mockResolvedValue({ id: 't1', name: 'Test' });
      const result = await service.getById('t1');
      expect(result.name).toBe('Test');
    });

    it('should throw NotFoundException', async () => {
      prisma.reelTemplate.findUnique.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('markUsed', () => {
    it('should increment use count', async () => {
      prisma.reelTemplate.findUnique.mockResolvedValue({ id: 't1', useCount: 5 });
      prisma.reelTemplate.update.mockResolvedValue({ id: 't1', useCount: 6 });
      const result = await service.markUsed('t1', 'u1');
      expect(result.useCount).toBe(6);
    });
  });

  describe('delete', () => {
    it('should delete own template', async () => {
      prisma.reelTemplate.findUnique.mockResolvedValue({ id: 't1', userId: 'u1' });
      prisma.reelTemplate.delete.mockResolvedValue({});
      const result = await service.delete('t1', 'u1');
      expect(result.deleted).toBe(true);
    });

    it('should throw ForbiddenException for non-owner', async () => {
      prisma.reelTemplate.findUnique.mockResolvedValue({ id: 't1', userId: 'other' });
      await expect(service.delete('t1', 'u1')).rejects.toThrow(ForbiddenException);
    });
  });
});

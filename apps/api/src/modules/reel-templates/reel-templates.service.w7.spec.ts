import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { ReelTemplatesService } from './reel-templates.service';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T03 #25-27, #34-35: reel-templates error paths + browse edge cases
 */
describe('ReelTemplatesService — W7 T03 gaps', () => {
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

  // T03 #25: markUsed — not found
  describe('markUsed — not found', () => {
    it('should throw NotFoundException when template not found', async () => {
      prisma.reelTemplate.findUnique.mockResolvedValue(null);
      await expect(service.markUsed('missing', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  // T03 #26: delete — not found
  describe('delete — not found', () => {
    it('should throw NotFoundException when template not found', async () => {
      prisma.reelTemplate.findUnique.mockResolvedValue(null);
      await expect(service.delete('missing', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  // T03 #27: create — negative segment times
  describe('create — negative segment times', () => {
    it('should throw BadRequestException for negative startMs', async () => {
      await expect(service.create('u1', {
        sourceReelId: 'r1', name: 'Test', segments: [{ startMs: -1, endMs: 5000 }],
      })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for negative endMs', async () => {
      await expect(service.create('u1', {
        sourceReelId: 'r1', name: 'Test', segments: [{ startMs: 0, endMs: -1 }],
      })).rejects.toThrow(BadRequestException);
    });
  });

  // T03 #34: browse — trending sort
  describe('browse — trending sort', () => {
    it('should sort by useCount desc when trending=true', async () => {
      prisma.reelTemplate.findMany.mockResolvedValue([
        { id: 't1', useCount: 100 },
        { id: 't2', useCount: 50 },
      ]);

      await service.browse(undefined, 20, true);

      expect(prisma.reelTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { useCount: 'desc' },
        }),
      );
    });

    it('should sort by createdAt desc when trending=false', async () => {
      prisma.reelTemplate.findMany.mockResolvedValue([]);

      await service.browse(undefined, 20, false);

      expect(prisma.reelTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // T03 #35: browse — limit clamping
  describe('browse — limit clamping', () => {
    it('should clamp limit > 50 to 50', async () => {
      prisma.reelTemplate.findMany.mockResolvedValue([]);

      await service.browse(undefined, 100);

      expect(prisma.reelTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 51 }), // 50 + 1 for hasMore
      );
    });

    it('should clamp limit < 1 to 1', async () => {
      prisma.reelTemplate.findMany.mockResolvedValue([]);

      await service.browse(undefined, 0);

      expect(prisma.reelTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2 }), // 1 + 1 for hasMore
      );
    });
  });
});

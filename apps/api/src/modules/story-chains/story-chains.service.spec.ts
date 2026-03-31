import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { StoryChainsService } from './story-chains.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StoryChainsService', () => {
  let service: StoryChainsService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        StoryChainsService,
        {
          provide: PrismaService,
          useValue: {
            storyChain: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
            storyChainEntry: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
            story: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            user: { findMany: jest.fn().mockResolvedValue([]) },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(StoryChainsService);
    prisma = module.get(PrismaService) as any;

    // Configure $transaction to pass the prisma mock as the transaction client
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
  });

  describe('createChain', () => {
    it('should create a story chain', async () => {
      prisma.storyChain.create.mockResolvedValue({ id: 'c1', prompt: 'Share your morning' });
      const result = await service.createChain('u1', { prompt: 'Share your morning' });
      expect(result.prompt).toBe('Share your morning');
    });

    it('should throw if prompt empty', async () => {
      await expect(service.createChain('u1', { prompt: '' })).rejects.toThrow(BadRequestException);
    });

    it('should throw if prompt too long', async () => {
      await expect(service.createChain('u1', { prompt: 'x'.repeat(301) })).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTrending', () => {
    it('should return trending chains', async () => {
      prisma.storyChain.findMany.mockResolvedValue([{ id: 'c1', participantCount: 50 }]);
      const result = await service.getTrending();
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('getChain', () => {
    it('should return chain with entries', async () => {
      prisma.storyChain.findUnique.mockResolvedValue({ id: 'c1', prompt: 'Test' });
      prisma.storyChainEntry.findMany.mockResolvedValue([{ id: 'e1', storyId: 's1', userId: 'u1' }]);
      const result = await service.getChain('c1');
      expect(result.chain.prompt).toBe('Test');
      expect(result.entries.data).toHaveLength(1);
    });

    it('should throw NotFoundException', async () => {
      prisma.storyChain.findUnique.mockResolvedValue(null);
      await expect(service.getChain('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('joinChain', () => {
    it('should add entry to chain within a transaction', async () => {
      prisma.storyChain.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
      prisma.storyChainEntry.findUnique.mockResolvedValue(null); // new entry
      prisma.storyChainEntry.upsert.mockResolvedValue({ id: 'e1', createdAt: new Date() });
      prisma.storyChain.update.mockResolvedValue({});
      const result = await service.joinChain('c1', 'u1', 's1');
      expect(result.id).toBe('e1');
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should increment participantCount for new entries', async () => {
      prisma.storyChain.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
      prisma.storyChainEntry.findUnique.mockResolvedValue(null); // new entry
      prisma.storyChainEntry.upsert.mockResolvedValue({ id: 'e1', createdAt: new Date() });
      prisma.storyChain.update.mockResolvedValue({});
      await service.joinChain('c1', 'u1', 's1');
      expect(prisma.storyChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { participantCount: { increment: 1 } },
        }),
      );
    });

    it('should not increment participantCount for existing entries', async () => {
      prisma.storyChain.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
      prisma.storyChainEntry.findUnique.mockResolvedValue({ id: 'e1', createdAt: new Date(Date.now() - 60000) }); // existing
      prisma.storyChainEntry.upsert.mockResolvedValue({ id: 'e1', createdAt: new Date(Date.now() - 60000) });
      await service.joinChain('c1', 'u1', 's1');
      expect(prisma.storyChain.update).not.toHaveBeenCalled();
    });

    it('should throw if story not yours', async () => {
      prisma.storyChain.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'other' });
      await expect(service.joinChain('c1', 'u1', 's1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getStats', () => {
    it('should return chain stats', async () => {
      prisma.storyChain.findUnique.mockResolvedValue({ id: 'c1', participantCount: 10, viewsCount: 500, createdAt: new Date(), createdById: 'u1' });
      const result = await service.getStats('c1');
      expect(result.participantCount).toBe(10);
      expect(result.viewsCount).toBe(500);
    });

    it('should throw NotFoundException for missing chain', async () => {
      prisma.storyChain.findUnique.mockResolvedValue(null);
      await expect(service.getStats('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTrending — pagination', () => {
    it('should set hasMore when results exceed limit', async () => {
      const chains = Array.from({ length: 21 }, (_, i) => ({ id: `c${i}`, participantCount: 100 - i }));
      prisma.storyChain.findMany.mockResolvedValue(chains);
      const result = await service.getTrending();
      expect(result.meta.hasMore).toBe(true);
      expect(result.data).toHaveLength(20);
      expect(result.meta.cursor).toBe('c19');
    });

    it('should return empty when no chains', async () => {
      prisma.storyChain.findMany.mockResolvedValue([]);
      const result = await service.getTrending();
      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.cursor).toBeNull();
    });

    it('should pass cursor to query', async () => {
      prisma.storyChain.findMany.mockResolvedValue([]);
      await service.getTrending('c10', 5);
      expect(prisma.storyChain.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: { lt: 'c10' } }),
        take: 6,
      }));
    });
  });

  describe('joinChain — not found', () => {
    it('should throw NotFoundException when chain not found', async () => {
      prisma.storyChain.findUnique.mockResolvedValue(null);
      await expect(service.joinChain('missing', 'u1', 's1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when story not found', async () => {
      prisma.storyChain.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.story.findUnique.mockResolvedValue(null);
      await expect(service.joinChain('c1', 'u1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createChain — with coverUrl', () => {
    it('should pass coverUrl to prisma', async () => {
      prisma.storyChain.create.mockResolvedValue({ id: 'c1', prompt: 'Test', coverUrl: 'https://img.test/cover.jpg' });
      const result = await service.createChain('u1', { prompt: 'Test', coverUrl: 'https://img.test/cover.jpg' });
      expect(result.coverUrl).toBe('https://img.test/cover.jpg');
      expect(prisma.storyChain.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ coverUrl: 'https://img.test/cover.jpg' }),
      }));
    });
  });

  describe('getChain — entries pagination', () => {
    it('should set hasMore when entries exceed limit', async () => {
      prisma.storyChain.findUnique.mockResolvedValue({ id: 'c1', prompt: 'Test' });
      const entries = Array.from({ length: 21 }, (_, i) => ({ id: `e${i}`, storyId: `s${i}`, userId: `u${i}` }));
      prisma.storyChainEntry.findMany.mockResolvedValue(entries);
      const result = await service.getChain('c1');
      expect(result.entries.meta.hasMore).toBe(true);
      expect(result.entries.data).toHaveLength(20);
    });
  });
});

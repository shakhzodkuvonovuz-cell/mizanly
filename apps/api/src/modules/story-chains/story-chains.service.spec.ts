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
            storyChain: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
            storyChainEntry: { findMany: jest.fn(), upsert: jest.fn() },
            story: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
            user: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();
    service = module.get(StoryChainsService);
    prisma = module.get(PrismaService) as any;
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
    it('should add entry to chain', async () => {
      prisma.storyChain.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.story.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' });
      const now = new Date();
      prisma.storyChainEntry.upsert.mockResolvedValue({ id: 'e1', createdAt: now });
      prisma.storyChain.update.mockResolvedValue({});
      const result = await service.joinChain('c1', 'u1', 's1');
      expect(result.id).toBe('e1');
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
  });
});

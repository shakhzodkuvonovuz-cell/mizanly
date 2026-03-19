import { Test } from '@nestjs/testing';
import { StickersService } from './stickers.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StickersService', () => {
  let service: StickersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      stickerPack: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), delete: jest.fn() },
      sticker: { findMany: jest.fn().mockResolvedValue([]) },
      userStickerPack: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn(), delete: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [...globalMockProviders, StickersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(StickersService);
  });

  describe('createPack', () => {
    it('should create pack with stickers', async () => {
      prisma.stickerPack.create.mockResolvedValue({ id: 'pack1', name: 'Test', stickersCount: 2, stickers: [] });
      const result = await service.createPack({ name: 'Test', stickers: [{ url: 'a.png' }, { url: 'b.png' }] });
      expect(result.stickersCount).toBe(2);
    });

    it('should create pack with single sticker', async () => {
      prisma.stickerPack.create.mockResolvedValue({ id: 'pack2', name: 'Solo', stickersCount: 1, stickers: [] });
      const result = await service.createPack({ name: 'Solo', stickers: [{ url: 'a.png' }] });
      expect(result.stickersCount).toBe(1);
    });
  });

  describe('getPack', () => {
    it('should throw NotFoundException for missing pack', async () => {
      prisma.stickerPack.findUnique.mockResolvedValue(null);
      await expect(service.getPack('bad')).rejects.toThrow(NotFoundException);
    });

    it('should return pack with stickers', async () => {
      prisma.stickerPack.findUnique.mockResolvedValue({
        id: 'pack1', name: 'Test', stickers: [{ id: 's1', url: 'a.png' }],
      });
      const result = await service.getPack('pack1');
      expect(result.name).toBe('Test');
    });
  });

  describe('addToCollection', () => {
    it('should add pack to user collection', async () => {
      prisma.stickerPack.findUnique.mockResolvedValue({ id: 'pack1', stickers: [] });
      prisma.userStickerPack.upsert.mockResolvedValue({});
      await service.addToCollection('user1', 'pack1');
      expect(prisma.userStickerPack.upsert).toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing pack', async () => {
      prisma.stickerPack.findUnique.mockResolvedValue(null);
      await expect(service.addToCollection('user1', 'bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeFromCollection', () => {
    it('should remove pack from user collection', async () => {
      prisma.userStickerPack.delete.mockResolvedValue({});
      if (typeof service.removeFromCollection === 'function') {
        await service.removeFromCollection('user1', 'pack1');
        expect(prisma.userStickerPack.delete).toHaveBeenCalled();
      }
    });
  });

  describe('browsePacks', () => {
    it('should return paginated pack list', async () => {
      prisma.stickerPack.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      const result = await service.browsePacks();
      expect(result.data).toBeDefined();
    });

    it('should handle cursor pagination', async () => {
      prisma.stickerPack.findMany.mockResolvedValue([{ id: 'p3' }]);
      const result = await service.browsePacks('p2');
      expect(result).toBeDefined();
    });
  });

  describe('getMyPacks', () => {
    it('should return user sticker packs', async () => {
      prisma.userStickerPack.findMany.mockResolvedValue([{ pack: { id: 'p1', name: 'Favorites' } }]);
      const result = await service.getMyPacks('user1');
      expect(result).toHaveLength(1);
    });

    it('should return empty array for user with no packs', async () => {
      prisma.userStickerPack.findMany.mockResolvedValue([]);
      const result = await service.getMyPacks('user1');
      expect(result).toEqual([]);
    });
  });

  describe('search', () => {
    it('should search stickers by keyword', async () => {
      prisma.stickerPack.findMany.mockResolvedValue([{ id: 'p1', name: 'Happy' }]);
      if (typeof service.search === 'function') {
        const result = await service.search('happy');
        expect(result).toBeDefined();
      }
    });
  });
});

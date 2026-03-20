import { Test } from '@nestjs/testing';
import { StickersService } from './stickers.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
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
      await service.removeFromCollection('user1', 'pack1');
      expect(prisma.userStickerPack.delete).toHaveBeenCalled();
    });
  });

  describe('browsePacks', () => {
    it('should return paginated pack list', async () => {
      prisma.stickerPack.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      const result = await service.browsePacks();
      expect(result.data).toHaveLength(2);
    });

    it('should handle cursor pagination', async () => {
      prisma.stickerPack.findMany.mockResolvedValue([{ id: 'p3' }]);
      const result = await service.browsePacks('p2');
      expect(result.data).toHaveLength(1);
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

  describe('searchPacks', () => {
    it('should search sticker packs by keyword', async () => {
      prisma.stickerPack.findMany.mockResolvedValue([{ id: 'p1', name: 'Happy Eid' }]);
      const result = await service.searchPacks('happy');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Happy Eid');
    });

    it('should return empty for no matches', async () => {
      prisma.stickerPack.findMany.mockResolvedValue([]);
      const result = await service.searchPacks('xyznonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('getRecentStickers', () => {
    it('should return recent stickers from user packs', async () => {
      prisma.userStickerPack.findMany.mockResolvedValue([
        { pack: { id: 'p1', stickers: [{ id: 's1', url: 'a.png' }] } },
      ]);
      const result = await service.getRecentStickers('user-1');
      expect(result).toHaveLength(1);
    });

    it('should return empty when user has no packs', async () => {
      prisma.userStickerPack.findMany.mockResolvedValue([]);
      const result = await service.getRecentStickers('user-1');
      expect(result).toEqual([]);
    });
  });

  describe('getFeaturedPacks', () => {
    it('should return free featured sticker packs', async () => {
      prisma.stickerPack.findMany.mockResolvedValue([{ id: 'p1', name: 'Featured', isFree: true }]);
      const result = await service.getFeaturedPacks();
      expect(result).toHaveLength(1);
    });
  });

  describe('deletePack', () => {
    it('should delete sticker pack', async () => {
      prisma.stickerPack.delete.mockResolvedValue({});
      const result = await service.deletePack('p1');
      expect(result).toEqual({ deleted: true });
    });
  });
});

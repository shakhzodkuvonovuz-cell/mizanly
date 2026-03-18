import { Test } from '@nestjs/testing';
import { StickersService } from './stickers.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StickersService', () => {
  let service: StickersService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      stickerPack: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
      sticker: { findMany: jest.fn() },
      userStickerPack: { findMany: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,StickersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(StickersService);
  });

  describe('createPack', () => {
    it('creates pack with stickers', async () => {
      prisma.stickerPack.create.mockResolvedValue({ id: 'pack1', name: 'Test', stickersCount: 2, stickers: [] });
      const result = await service.createPack({ name: 'Test', stickers: [{ url: 'a.png' }, { url: 'b.png' }] });
      expect(result.stickersCount).toBe(2);
    });
  });

  describe('getPack', () => {
    it('throws NotFoundException', async () => {
      prisma.stickerPack.findUnique.mockResolvedValue(null);
      await expect(service.getPack('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addToCollection', () => {
    it('upserts user sticker pack', async () => {
      prisma.stickerPack.findUnique.mockResolvedValue({ id: 'pack1', stickers: [] });
      prisma.userStickerPack.upsert.mockResolvedValue({});
      await service.addToCollection('user1', 'pack1');
      expect(prisma.userStickerPack.upsert).toHaveBeenCalled();
    });
  });
});
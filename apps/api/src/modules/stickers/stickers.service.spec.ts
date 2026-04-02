import { Test } from '@nestjs/testing';
import { StickersService } from './stickers.service';
import { PrismaService } from '../../config/prisma.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StickersService', () => {
  let service: StickersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      stickerPack: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), delete: jest.fn() },
      sticker: { findMany: jest.fn().mockResolvedValue([]) },
      userStickerPack: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn(), delete: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [...globalMockProviders, StickersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(StickersService);
  });

  describe('createPack', () => {
    it('should create pack with stickers', async () => {
      prisma.stickerPack.create.mockResolvedValue({ id: 'pack1', name: 'Test', stickersCount: 2, stickers: [] });
      const result = await service.createPack({ name: 'Test', stickers: [{ url: 'a.png' }, { url: 'b.png' }] }, 'user-1');
      expect(result.stickersCount).toBe(2);
    });

    it('should create pack with single sticker', async () => {
      prisma.stickerPack.create.mockResolvedValue({ id: 'pack2', name: 'Solo', stickersCount: 1, stickers: [] });
      const result = await service.createPack({ name: 'Solo', stickers: [{ url: 'a.png' }] }, 'user-1');
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
      prisma.userStickerPack.findMany.mockResolvedValue([{ packId: 'p1' }]);
      prisma.sticker.findMany.mockResolvedValue([{ id: 's1', url: 'a.png', packId: 'p1' }]);
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
    it('should delete sticker pack when owner', async () => {
      prisma.stickerPack.findUnique.mockResolvedValue({ ownerId: 'user-1' });
      prisma.stickerPack.delete.mockResolvedValue({});
      const result = await service.deletePack('p1', 'user-1');
      expect(result).toEqual({ deleted: true });
    });

    it('should delete sticker pack when admin', async () => {
      prisma.stickerPack.findUnique.mockResolvedValue({ ownerId: 'other-user' });
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.stickerPack.delete.mockResolvedValue({});
      const result = await service.deletePack('p1', 'admin-user');
      expect(result).toEqual({ deleted: true });
    });

    it('should throw when non-owner non-admin tries to delete (T06 #94)', async () => {
      prisma.stickerPack.findUnique.mockResolvedValue({ ownerId: 'other-user' });
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
      await expect(service.deletePack('p1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════
  // T06 — AI Sticker Generation Tests (H65-68, M87-92)
  // ═══════════════════════════════════════════════════════

  describe('generateSticker (T06 #65)', () => {
    beforeEach(() => {
      prisma.generatedSticker = {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'gs-1', imageUrl: 'data:image/svg+xml;base64,...', prompt: 'cat', style: 'cartoon' }),
      };
    });

    it('should reject blocked terms (T06 #87)', async () => {
      await expect(service.generateSticker('u1', 'nude content here')).rejects.toThrow(BadRequestException);
      await expect(service.generateSticker('u1', 'a violent scene')).rejects.toThrow(BadRequestException);
      await expect(service.generateSticker('u1', 'porn stuff')).rejects.toThrow(BadRequestException);
    });

    it('should reject when daily limit reached (T06 #88)', async () => {
      prisma.generatedSticker.count.mockResolvedValue(10);
      await expect(service.generateSticker('u1', 'cute cat')).rejects.toThrow(BadRequestException);
      await expect(service.generateSticker('u1', 'cute cat')).rejects.toThrow(/limit/i);
    });

    it('should generate fallback sticker when no API key (T06 #89)', async () => {
      // Config returns null for ANTHROPIC_API_KEY (default in mock)
      prisma.generatedSticker.count.mockResolvedValue(0);
      const result = await service.generateSticker('u1', 'happy star');
      expect(result.id).toBe('gs-1');
      expect(result.imageUrl).toBeDefined();
      expect(prisma.generatedSticker.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', prompt: 'happy star', style: 'cartoon' }),
      }));
    });
  });

  describe('saveGeneratedSticker (T06 #66)', () => {
    beforeEach(() => {
      prisma.generatedSticker = { findUnique: jest.fn() };
      prisma.$transaction = jest.fn().mockResolvedValue(undefined);
    });

    it('should throw NotFoundException when sticker not found (T06 #91)', async () => {
      prisma.generatedSticker.findUnique.mockResolvedValue(null);
      await expect(service.saveGeneratedSticker('u1', 'bad')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when sticker belongs to different user (T06 #91)', async () => {
      prisma.generatedSticker.findUnique.mockResolvedValue({ id: 'gs-1', userId: 'other' });
      await expect(service.saveGeneratedSticker('u1', 'gs-1')).rejects.toThrow(NotFoundException);
    });

    it('should save sticker via transaction', async () => {
      prisma.generatedSticker.findUnique.mockResolvedValue({ id: 'gs-1', userId: 'u1', imageUrl: 'url', prompt: 'cat' });
      const result = await service.saveGeneratedSticker('u1', 'gs-1');
      expect(result).toEqual({ saved: true });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('getMyGeneratedStickers (T06 #67)', () => {
    beforeEach(() => {
      prisma.generatedSticker = { findMany: jest.fn() };
    });

    it('should return paginated generated stickers', async () => {
      prisma.generatedSticker.findMany.mockResolvedValue([
        { id: 'gs-1', imageUrl: 'url1', prompt: 'cat', style: 'cartoon', createdAt: new Date() },
      ]);
      const result = await service.getMyGeneratedStickers('u1');
      expect(result.data).toHaveLength(1);
      expect(result.meta.hasMore).toBe(false);
    });

    it('should set hasMore when more than 20 results', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({
        id: `gs-${i}`, imageUrl: `url${i}`, prompt: `p${i}`, style: 'cartoon', createdAt: new Date(),
      }));
      prisma.generatedSticker.findMany.mockResolvedValue(items);
      const result = await service.getMyGeneratedStickers('u1');
      expect(result.data).toHaveLength(20);
      expect(result.meta.hasMore).toBe(true);
    });
  });

  describe('getIslamicPresetStickers (T06 #68)', () => {
    it('should return 20 preset stickers', () => {
      const result = service.getIslamicPresetStickers();
      expect(result).toHaveLength(20);
      expect(result[0].id).toBe('islamic-1');
      expect(result[0].text).toBe('Alhamdulillah');
      expect(result[0].style).toBe('calligraphy');
    });
  });

  describe('sanitizeSvg XSS prevention (T06 #92)', () => {
    it('should strip script tags', () => {
      const dirty = '<svg><script>alert("xss")</script><circle r="10"/></svg>';
      const result = (service as any).sanitizeSvg(dirty);
      expect(result).not.toContain('<script');
      expect(result).toContain('<circle');
    });

    it('should strip event handlers', () => {
      const dirty = '<svg><rect onload="alert(1)" width="10"/></svg>';
      const result = (service as any).sanitizeSvg(dirty);
      expect(result).not.toContain('onload');
    });

    it('should strip javascript: URIs', () => {
      const dirty = '<svg><a href="javascript:alert(1)">link</a></svg>';
      const result = (service as any).sanitizeSvg(dirty);
      expect(result).not.toContain('javascript:');
    });

    it('should strip foreignObject elements', () => {
      const dirty = '<svg><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>';
      const result = (service as any).sanitizeSvg(dirty);
      expect(result).not.toContain('foreignObject');
    });
  });

  // ── T06 Remaining M-severity (#93, #95) ──

  describe('removeFromCollection — P2025 error (T06 #93)', () => {
    it('should throw NotFoundException when pack not in collection (P2025)', async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: '5.0.0' });
      prisma.userStickerPack.delete.mockRejectedValue(p2025);
      await expect(service.removeFromCollection('u1', 'pack-not-in-collection')).rejects.toThrow(NotFoundException);
    });

    it('should re-throw non-P2025 errors', async () => {
      prisma.userStickerPack.delete.mockRejectedValue(new Error('DB connection lost'));
      await expect(service.removeFromCollection('u1', 'p1')).rejects.toThrow('DB connection lost');
    });
  });

  describe('deletePack — pack not found (T06 #95)', () => {
    it('should throw NotFoundException when pack does not exist', async () => {
      prisma.stickerPack.findUnique.mockResolvedValue(null);
      await expect(service.deletePack('nonexistent', 'u1')).rejects.toThrow(NotFoundException);
    });
  });
});

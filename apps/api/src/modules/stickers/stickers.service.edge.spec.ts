import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { StickersService } from './stickers.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StickersService — edge cases', () => {
  let service: StickersService;
  let prisma: any;
  const userId = 'user-edge-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        StickersService,
        {
          provide: PrismaService,
          useValue: {
            stickerPack: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            sticker: { create: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
            stickerCollection: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
            generatedSticker: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<StickersService>(StickersService);
    prisma = module.get(PrismaService);
  });

  it('should throw NotFoundException for non-existent sticker pack', async () => {
    prisma.stickerPack.findUnique.mockResolvedValue(null);
    await expect(service.getPack('nonexistent'))
      .rejects.toThrow(NotFoundException);
  });

  it('should return empty browse results when no packs exist', async () => {
    const result = await service.browsePacks();
    expect(result.data).toEqual([]);
  });

  it('should return empty search results for empty query', async () => {
    const result = await service.searchPacks('');
    expect(result).toEqual([]);
  });
});

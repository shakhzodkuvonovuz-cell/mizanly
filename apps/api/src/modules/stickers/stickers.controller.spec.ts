import { Test, TestingModule } from '@nestjs/testing';
import { StickersController } from './stickers.controller';
import { StickersService } from './stickers.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StickersController', () => {
  let controller: StickersController;
  let service: StickersService;

  const mockService = {
    createPack: jest.fn(),
    getPack: jest.fn(),
    browsePacks: jest.fn(),
    searchPacks: jest.fn(),
    addToCollection: jest.fn(),
    removeFromCollection: jest.fn(),
    getMyPacks: jest.fn(),
    getRecentStickers: jest.fn(),
    getFeaturedPacks: jest.fn(),
    deletePack: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StickersController],
      providers: [
        ...globalMockProviders,
        { provide: StickersService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<StickersController>(StickersController);
    service = module.get<StickersService>(StickersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(StickersController);
  });

  describe('createPack', () => {
    it('should call service.createPack', async () => {
      const dto = { name: 'Pack', description: 'desc', stickers: [] };
      const expected = { id: 'pack-1', ...dto };
      mockService.createPack.mockResolvedValue(expected);
      const result = await controller.createPack(dto as any);
      expect(service.createPack).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('browse', () => {
    it('should call service.browsePacks', async () => {
      const expected = { data: [], meta: { cursor: null, hasMore: false } };
      mockService.browsePacks.mockResolvedValue(expected);
      const result = await controller.browse(undefined);
      expect(service.browsePacks).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(expected);
    });
  });

  describe('featured', () => {
    it('should call service.getFeaturedPacks', async () => {
      const expected = [{ id: 'pack-1' }];
      mockService.getFeaturedPacks.mockResolvedValue(expected);
      const result = await controller.featured();
      expect(service.getFeaturedPacks).toHaveBeenCalled();
      expect(result).toEqual(expected);
    });
  });

  describe('search', () => {
    it('should call service.searchPacks', async () => {
      const expected = { data: [], meta: { cursor: null, hasMore: false } };
      mockService.searchPacks.mockResolvedValue(expected);
      const result = await controller.search('query');
      expect(service.searchPacks).toHaveBeenCalledWith('query');
      expect(result).toEqual(expected);
    });
  });

  describe('getPack', () => {
    it('should call service.getPack', async () => {
      const expected = { id: 'pack-1', stickers: [] };
      mockService.getPack.mockResolvedValue(expected);
      const result = await controller.getPack('pack-1');
      expect(service.getPack).toHaveBeenCalledWith('pack-1');
      expect(result).toEqual(expected);
    });
  });

  describe('deletePack', () => {
    it('should call service.deletePack', async () => {
      mockService.deletePack.mockResolvedValue({ deleted: true });
      await controller.deletePack('pack-1');
      expect(service.deletePack).toHaveBeenCalledWith('pack-1');
    });
  });

  describe('myPacks', () => {
    it('should call service.getMyPacks', async () => {
      const expected = [{ id: 'pack-1' }];
      mockService.getMyPacks.mockResolvedValue(expected);
      const result = await controller.myPacks('user-1');
      expect(service.getMyPacks).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(expected);
    });
  });

  describe('recent', () => {
    it('should call service.getRecentStickers', async () => {
      const expected = [{ id: 'sticker-1' }];
      mockService.getRecentStickers.mockResolvedValue(expected);
      const result = await controller.recent('user-1');
      expect(service.getRecentStickers).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(expected);
    });
  });

  describe('addPack', () => {
    it('should call service.addToCollection', async () => {
      mockService.addToCollection.mockResolvedValue({ added: true });
      await controller.addPack('user-1', 'pack-1');
      expect(service.addToCollection).toHaveBeenCalledWith('user-1', 'pack-1');
    });
  });

  describe('removePack', () => {
    it('should call service.removeFromCollection', async () => {
      mockService.removeFromCollection.mockResolvedValue({ removed: true });
      await controller.removePack('user-1', 'pack-1');
      expect(service.removeFromCollection).toHaveBeenCalledWith('user-1', 'pack-1');
    });
  });
});
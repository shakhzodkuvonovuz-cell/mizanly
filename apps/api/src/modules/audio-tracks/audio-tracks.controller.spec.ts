import { Test, TestingModule } from '@nestjs/testing';
import { AudioTracksController } from './audio-tracks.controller';
import { AudioTracksService } from './audio-tracks.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('AudioTracksController', () => {
  let controller: AudioTracksController;
  let service: AudioTracksService;

  const mockService = {
    create: jest.fn(),
    trending: jest.fn(),
    search: jest.fn(),
    getById: jest.fn(),
    getReelsUsingTrack: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AudioTracksController],
      providers: [
        ...globalMockProviders,
        { provide: AudioTracksService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<AudioTracksController>(AudioTracksController);
    service = module.get<AudioTracksService>(AudioTracksService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto = { title: 'Track', artist: 'Artist', duration: 180, audioUrl: 'url' };
      const expected = { id: 'track-1' };
      mockService.create.mockResolvedValue(expected);
      const result = await controller.create('user-1', dto as any);
      expect(service.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual(expected);
    });
  });

  describe('trending', () => {
    it('should call service.trending with cursor and limit', async () => {
      const expected = { data: [{ id: 'track-1' }], meta: { cursor: null, hasMore: false } };
      mockService.trending.mockResolvedValue(expected);
      const result = await controller.trending('cursor-1', '10');
      expect(service.trending).toHaveBeenCalledWith('cursor-1', 10);
      expect(result).toEqual(expected);
    });

    it('should call service.trending without optional params', async () => {
      const expected = { data: [{ id: 'track-1' }], meta: { cursor: null, hasMore: false } };
      mockService.trending.mockResolvedValue(expected);
      const result = await controller.trending();
      expect(service.trending).toHaveBeenCalledWith(undefined, undefined);
      expect(result).toEqual(expected);
    });
  });

  describe('search', () => {
    it('should call service.search with cursor and limit', async () => {
      const expected = { data: [{ id: 'track-1' }], meta: { cursor: null, hasMore: false } };
      mockService.search.mockResolvedValue(expected);
      const result = await controller.search('query', 'cursor-1', '15');
      expect(service.search).toHaveBeenCalledWith('query', 'cursor-1', 15);
      expect(result).toEqual(expected);
    });

    it('should call service.search without optional params', async () => {
      const expected = { data: [{ id: 'track-1' }], meta: { cursor: null, hasMore: false } };
      mockService.search.mockResolvedValue(expected);
      const result = await controller.search('query');
      expect(service.search).toHaveBeenCalledWith('query', undefined, undefined);
      expect(result).toEqual(expected);
    });
  });

  describe('getById', () => {
    it('should call service.getById', async () => {
      const expected = { id: 'track-1' };
      mockService.getById.mockResolvedValue(expected);
      const result = await controller.getById('track-1');
      expect(service.getById).toHaveBeenCalledWith('track-1');
      expect(result).toEqual(expected);
    });
  });

  describe('reels', () => {
    it('should call service.getReelsUsingTrack', async () => {
      const expected = { data: [], meta: { cursor: null, hasMore: false } };
      mockService.getReelsUsingTrack.mockResolvedValue(expected);
      const result = await controller.reels('track-1', undefined);
      expect(service.getReelsUsingTrack).toHaveBeenCalledWith('track-1', undefined);
      expect(result).toEqual(expected);
    });
  });

  describe('delete', () => {
    it('should call service.delete', async () => {
      mockService.delete.mockResolvedValue({ deleted: true });
      await controller.delete('user-1', 'track-1');
      expect(service.delete).toHaveBeenCalledWith('track-1', 'user-1');
    });
  });
});
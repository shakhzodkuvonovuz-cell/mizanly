import { Test, TestingModule } from '@nestjs/testing';
import { GiphyController } from './giphy.controller';
import { GiphyService, GiphyProxyResult } from './giphy.service';
import { ConfigService } from '@nestjs/config';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';

describe('GiphyController', () => {
  let controller: GiphyController;
  let service: GiphyService;

  const mockGiphyResult: GiphyProxyResult = {
    data: [
      { type: 'gif', id: 'abc123', title: 'funny cat', images: { original: { url: 'https://media.giphy.com/abc.gif' } } },
      { type: 'gif', id: 'def456', title: 'cute dog', images: { original: { url: 'https://media.giphy.com/def.gif' } } },
    ],
    pagination: { total_count: 100, count: 2, offset: 0 },
    meta: { status: 200, msg: 'OK', response_id: 'resp-1' },
  };

  const emptyResult: GiphyProxyResult = {
    data: [],
    pagination: { total_count: 0, count: 0, offset: 0 },
    meta: { status: 200, msg: 'OK', response_id: '' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GiphyController],
      providers: [
        GiphyService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-giphy-api-key'),
          },
        },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GiphyController>(GiphyController);
    service = module.get<GiphyService>(GiphyService);
  });

  describe('GET /giphy/search', () => {
    it('should return GIPHY search results for a query', async () => {
      jest.spyOn(service, 'search').mockResolvedValue(mockGiphyResult);

      const result = await controller.search('cats', '25', '0', 'pg');

      expect(result).toBe(mockGiphyResult);
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total_count).toBe(100);
      expect(service.search).toHaveBeenCalledWith({
        q: 'cats',
        limit: 25,
        offset: 0,
        rating: 'pg',
      });
    });

    it('should use default values when optional params are omitted', async () => {
      jest.spyOn(service, 'search').mockResolvedValue(mockGiphyResult);

      await controller.search('dogs');

      expect(service.search).toHaveBeenCalledWith({
        q: 'dogs',
        limit: undefined,
        offset: undefined,
        rating: undefined,
      });
    });

    it('should parse limit and offset as integers', async () => {
      jest.spyOn(service, 'search').mockResolvedValue(mockGiphyResult);

      await controller.search('emoji', '10', '5', 'g');

      expect(service.search).toHaveBeenCalledWith({
        q: 'emoji',
        limit: 10,
        offset: 5,
        rating: 'g',
      });
    });

    it('should return empty results when service returns empty', async () => {
      jest.spyOn(service, 'search').mockResolvedValue(emptyResult);

      const result = await controller.search('nonexistent');

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total_count).toBe(0);
    });
  });

  describe('GET /giphy/trending', () => {
    it('should return trending GIFs', async () => {
      jest.spyOn(service, 'trending').mockResolvedValue(mockGiphyResult);

      const result = await controller.trending('25', '0', 'pg-13');

      expect(result).toBe(mockGiphyResult);
      expect(result.data).toHaveLength(2);
      expect(service.trending).toHaveBeenCalledWith({
        limit: 25,
        offset: 0,
        rating: 'pg-13',
      });
    });

    it('should use default values when optional params are omitted', async () => {
      jest.spyOn(service, 'trending').mockResolvedValue(mockGiphyResult);

      await controller.trending();

      expect(service.trending).toHaveBeenCalledWith({
        limit: undefined,
        offset: undefined,
        rating: undefined,
      });
    });

    it('should return empty results when service returns empty', async () => {
      jest.spyOn(service, 'trending').mockResolvedValue(emptyResult);

      const result = await controller.trending();

      expect(result.data).toHaveLength(0);
    });
  });
});

describe('GiphyService', () => {
  let service: GiphyService;

  const mockFetch = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch = mockFetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GiphyService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-giphy-api-key'),
          },
        },
      ],
    }).compile();

    service = module.get<GiphyService>(GiphyService);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('search', () => {
    it('should call GIPHY API with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: '1', title: 'test' }],
          pagination: { total_count: 1, count: 1, offset: 0 },
          meta: { status: 200, msg: 'OK', response_id: 'r1' },
        }),
      });

      const result = await service.search({ q: 'cats', limit: 10, offset: 0, rating: 'pg' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('api.giphy.com/v1/gifs/search');
      expect(calledUrl).toContain('api_key=test-giphy-api-key');
      expect(calledUrl).toContain('q=cats');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=0');
      expect(calledUrl).toContain('rating=pg');
      expect(result.data).toHaveLength(1);
    });

    it('should clamp limit to 50 max', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { total_count: 0, count: 0, offset: 0 },
          meta: { status: 200, msg: 'OK', response_id: '' },
        }),
      });

      await service.search({ q: 'test', limit: 100 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=50');
    });

    it('should clamp limit to 1 min', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { total_count: 0, count: 0, offset: 0 },
          meta: { status: 200, msg: 'OK', response_id: '' },
        }),
      });

      await service.search({ q: 'test', limit: -5 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=1');
    });

    it('should clamp negative offset to 0', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { total_count: 0, count: 0, offset: 0 },
          meta: { status: 200, msg: 'OK', response_id: '' },
        }),
      });

      await service.search({ q: 'test', offset: -10 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('offset=0');
    });

    it('should sanitize invalid rating to pg-13', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { total_count: 0, count: 0, offset: 0 },
          meta: { status: 200, msg: 'OK', response_id: '' },
        }),
      });

      await service.search({ q: 'test', rating: 'xxx' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('rating=pg-13');
    });

    it('should return empty results when GIPHY API returns non-ok', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

      const result = await service.search({ q: 'cats' });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.total_count).toBe(0);
    });

    it('should return empty results when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await service.search({ q: 'cats' });

      expect(result.data).toHaveLength(0);
    });

    it('should encode query parameter', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { total_count: 0, count: 0, offset: 0 },
          meta: { status: 200, msg: 'OK', response_id: '' },
        }),
      });

      await service.search({ q: 'funny cats & dogs' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('q=funny%20cats%20%26%20dogs');
    });
  });

  describe('trending', () => {
    it('should call GIPHY trending endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: 't1', title: 'trending gif' }],
          pagination: { total_count: 1, count: 1, offset: 0 },
          meta: { status: 200, msg: 'OK', response_id: 'r2' },
        }),
      });

      const result = await service.trending({ limit: 20 });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('api.giphy.com/v1/gifs/trending');
      expect(calledUrl).toContain('api_key=test-giphy-api-key');
      expect(calledUrl).toContain('limit=20');
      expect(result.data).toHaveLength(1);
    });

    it('should use defaults when no params provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { total_count: 0, count: 0, offset: 0 },
          meta: { status: 200, msg: 'OK', response_id: '' },
        }),
      });

      await service.trending({});

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=25');
      expect(calledUrl).toContain('offset=0');
      expect(calledUrl).toContain('rating=pg-13');
    });

    it('should return empty results on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await service.trending({});

      expect(result.data).toHaveLength(0);
    });
  });

  describe('no API key', () => {
    it('should return empty results when GIPHY_API_KEY is not set', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GiphyService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(''),
            },
          },
        ],
      }).compile();

      const noKeyService = module.get<GiphyService>(GiphyService);

      const searchResult = await noKeyService.search({ q: 'cats' });
      expect(searchResult.data).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();

      const trendingResult = await noKeyService.trending({});
      expect(trendingResult.data).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

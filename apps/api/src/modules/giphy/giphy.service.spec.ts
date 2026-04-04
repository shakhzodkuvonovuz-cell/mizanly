import { Test, TestingModule } from '@nestjs/testing';
import { GiphyService, GiphyProxyResult } from './giphy.service';
import { ConfigService } from '@nestjs/config';

describe('GiphyService', () => {
  let service: GiphyService;
  const mockFetch = jest.fn();

  const mockGiphyResponse: GiphyProxyResult = {
    data: [{ id: '1', title: 'test gif' }],
    pagination: { total_count: 1, count: 1, offset: 0 },
    meta: { status: 200, msg: 'OK', response_id: 'r1' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch = mockFetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GiphyService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-api-key') },
        },
      ],
    }).compile();

    service = module.get<GiphyService>(GiphyService);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('search', () => {
    it('should call GIPHY API with correct URL and parameters', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => mockGiphyResponse });

      await service.search({ q: 'cats', limit: 10, offset: 5, rating: 'g' });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('api.giphy.com/v1/gifs/search');
      expect(url).toContain('api_key=test-api-key');
      expect(url).toContain('q=cats');
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=5');
      expect(url).toContain('rating=g');
    });

    it('should use default values for limit, offset, rating', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => mockGiphyResponse });

      await service.search({ q: 'dogs' });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=25');
      expect(url).toContain('offset=0');
      expect(url).toContain('rating=pg-13');
    });

    it('should clamp limit to maximum of 50', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => mockGiphyResponse });

      await service.search({ q: 'test', limit: 200 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=50');
    });

    it('should clamp limit to minimum of 1', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => mockGiphyResponse });

      await service.search({ q: 'test', limit: -10 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=1');
    });

    it('should clamp negative offset to 0', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => mockGiphyResponse });

      await service.search({ q: 'test', offset: -5 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('offset=0');
    });

    it('should sanitize invalid rating to pg-13', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => mockGiphyResponse });

      await service.search({ q: 'test', rating: 'xxx' });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('rating=pg-13');
    });

    it('should allow valid ratings: g, pg, pg-13, r', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => mockGiphyResponse });

      for (const rating of ['g', 'pg', 'pg-13', 'r']) {
        mockFetch.mockClear();
        await service.search({ q: 'test', rating });
        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain(`rating=${rating}`);
      }
    });

    it('should URL-encode the query', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => mockGiphyResponse });

      await service.search({ q: 'cats & dogs' });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('q=cats%20%26%20dogs');
    });

    it('should return empty result on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });

      const result = await service.search({ q: 'test' });

      expect(result.data).toEqual([]);
      expect(result.pagination.total_count).toBe(0);
    });

    it('should return empty result on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await service.search({ q: 'test' });

      expect(result.data).toEqual([]);
    });

    it('should return empty result on timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const result = await service.search({ q: 'test' });

      expect(result.data).toEqual([]);
    });

    it('should pass AbortSignal to fetch', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => mockGiphyResponse });

      await service.search({ q: 'test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe('trending', () => {
    it('should call GIPHY trending endpoint', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => mockGiphyResponse });

      await service.trending({ limit: 20 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('api.giphy.com/v1/gifs/trending');
      expect(url).toContain('limit=20');
    });

    it('should use default values', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => mockGiphyResponse });

      await service.trending({});

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('limit=25');
      expect(url).toContain('offset=0');
      expect(url).toContain('rating=pg-13');
    });

    it('should return empty result on error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await service.trending({});

      expect(result.data).toEqual([]);
    });
  });

  describe('no API key', () => {
    it('should return empty results without calling fetch', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GiphyService,
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
        ],
      }).compile();

      const noKeyService = module.get<GiphyService>(GiphyService);

      const searchResult = await noKeyService.search({ q: 'cats' });
      expect(searchResult.data).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();

      const trendingResult = await noKeyService.trending({});
      expect(trendingResult.data).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

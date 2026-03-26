import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MeilisearchService } from './meilisearch.service';
import { CircuitBreakerService } from '../../common/services/circuit-breaker.service';

describe('MeilisearchService', () => {
  const TEST_HOST = 'http://meili.test:7700';
  const TEST_API_KEY = 'test-api-key-123';

  let mockFetch: jest.Mock;
  const originalFetch = global.fetch;

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function createMockConfigService(host: string, apiKey: string) {
    return {
      get: jest.fn((key: string) => {
        if (key === 'MEILISEARCH_HOST') return host;
        if (key === 'MEILISEARCH_API_KEY') return apiKey;
        return undefined;
      }),
    };
  }

  const mockCircuitBreakerService = {
    exec: jest.fn().mockImplementation((_name: string, fn: () => Promise<unknown>, fallback?: () => unknown) => {
      return fn().catch((err: unknown) => {
        if (fallback) return fallback();
        throw err;
      });
    }),
    getBreaker: jest.fn(),
    getStatus: jest.fn().mockReturnValue({}),
  };

  async function buildService(host: string, apiKey: string): Promise<MeilisearchService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeilisearchService,
        {
          provide: ConfigService,
          useValue: createMockConfigService(host, apiKey),
        },
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreakerService,
        },
      ],
    }).compile();

    return module.get<MeilisearchService>(MeilisearchService);
  }

  describe('constructor', () => {
    it('should set available=true when MEILISEARCH_HOST is configured', async () => {
      const service = await buildService(TEST_HOST, TEST_API_KEY);
      expect(service.isAvailable()).toBe(true);
    });

    it('should set available=false when MEILISEARCH_HOST is empty', async () => {
      const service = await buildService('', '');
      expect(service.isAvailable()).toBe(false);
    });

    it('should set available=false when MEILISEARCH_HOST is undefined', async () => {
      const mockConfig = { get: jest.fn().mockReturnValue(undefined) };
      const module = await Test.createTestingModule({
        providers: [
          MeilisearchService,
          { provide: ConfigService, useValue: mockConfig },
          { provide: CircuitBreakerService, useValue: mockCircuitBreakerService },
        ],
      }).compile();
      const service = module.get<MeilisearchService>(MeilisearchService);
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('onModuleInit', () => {
    beforeEach(() => {
      mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;
    });

    it('should skip initialization when not available', async () => {
      const service = await buildService('', '');
      await service.onModuleInit();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should create 6 indexes when available', async () => {
      const service = await buildService(TEST_HOST, TEST_API_KEY);
      await service.onModuleInit();

      // 6 createIndex calls (POST /indexes) + 6 updateSettings calls (PATCH /indexes/:name/settings) = 12
      expect(mockFetch).toHaveBeenCalledTimes(12);

      // Verify each index was created
      const expectedIndexes = ['users', 'posts', 'threads', 'reels', 'videos', 'hashtags'];
      for (const indexName of expectedIndexes) {
        expect(mockFetch).toHaveBeenCalledWith(
          `${TEST_HOST}/indexes`,
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              Authorization: `Bearer ${TEST_API_KEY}`,
            }),
            body: JSON.stringify({ uid: indexName, primaryKey: 'id' }),
          }),
        );
      }
    });

    it('should configure searchable/filterable/sortable attributes for each index', async () => {
      const service = await buildService(TEST_HOST, TEST_API_KEY);
      await service.onModuleInit();

      // Verify users settings
      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_HOST}/indexes/users/settings`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            searchableAttributes: ['username', 'displayName', 'bio'],
            filterableAttributes: ['isVerified'],
            sortableAttributes: ['followerCount'],
          }),
        }),
      );

      // Verify posts settings
      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_HOST}/indexes/posts/settings`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            searchableAttributes: ['content', 'hashtags', 'username'],
            filterableAttributes: ['userId', 'postType', 'visibility', 'isRemoved'],
            sortableAttributes: ['likesCount', 'createdAt'],
          }),
        }),
      );

      // Verify threads settings
      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_HOST}/indexes/threads/settings`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            searchableAttributes: ['content', 'hashtags', 'username'],
            filterableAttributes: ['userId', 'visibility', 'isRemoved', 'isChainHead'],
            sortableAttributes: ['likesCount', 'createdAt'],
          }),
        }),
      );

      // Verify reels settings
      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_HOST}/indexes/reels/settings`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            searchableAttributes: ['caption', 'hashtags', 'username'],
            filterableAttributes: ['userId', 'status', 'isRemoved'],
            sortableAttributes: ['likesCount', 'viewsCount', 'createdAt'],
          }),
        }),
      );

      // Verify videos settings
      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_HOST}/indexes/videos/settings`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            searchableAttributes: ['title', 'description', 'tags', 'username'],
            filterableAttributes: ['userId', 'channelId', 'category', 'status', 'isRemoved'],
            sortableAttributes: ['viewsCount', 'likesCount', 'publishedAt', 'createdAt'],
          }),
        }),
      );

      // Verify hashtags settings
      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_HOST}/indexes/hashtags/settings`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            searchableAttributes: ['name'],
            sortableAttributes: ['postsCount', 'createdAt'],
          }),
        }),
      );
    });

    it('should handle initialization error gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));
      const service = await buildService(TEST_HOST, TEST_API_KEY);

      // Should not throw
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it('should handle createIndex failure and continue with remaining indexes', async () => {
      // First call fails, rest succeed
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      // After first createIndex fails, the for-loop catch re-throws to outer catch
      const service = await buildService(TEST_HOST, TEST_API_KEY);
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      mockFetch = jest.fn();
      global.fetch = mockFetch;
    });

    it('should return null when not available', async () => {
      const service = await buildService('', '');
      const result = await service.search('posts', 'test query');
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should call Meilisearch API with correct URL and headers', async () => {
      const mockResponse = {
        hits: [{ id: 'post-1', type: 'post', content: 'test' }],
        estimatedTotalHits: 1,
        processingTimeMs: 5,
        query: 'test',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const service = await buildService(TEST_HOST, TEST_API_KEY);
      const result = await service.search('posts', 'test');

      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_HOST}/indexes/posts/search`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
          body: JSON.stringify({
            q: 'test',
            limit: 20,
            offset: 0,
            filter: undefined,
            sort: undefined,
          }),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('should use default limit=20 and offset=0 when no options provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ hits: [], estimatedTotalHits: 0, processingTimeMs: 1, query: 'q' }),
      });
      const service = await buildService(TEST_HOST, TEST_API_KEY);
      await service.search('users', 'q');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.limit).toBe(20);
      expect(callBody.offset).toBe(0);
    });

    it('should pass limit and offset options to API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ hits: [], estimatedTotalHits: 0, processingTimeMs: 1, query: 'q' }),
      });

      const service = await buildService(TEST_HOST, TEST_API_KEY);
      await service.search('posts', 'islamic', { limit: 10, offset: 30 });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.limit).toBe(10);
      expect(callBody.offset).toBe(30);
    });

    it('should pass filter and sort options to API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ hits: [], estimatedTotalHits: 0, processingTimeMs: 1, query: 'q' }),
      });

      const service = await buildService(TEST_HOST, TEST_API_KEY);
      await service.search('posts', 'test', {
        filter: 'userId = "user-1"',
        sort: ['createdAt:desc'],
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.filter).toBe('userId = "user-1"');
      expect(callBody.sort).toEqual(['createdAt:desc']);
    });

    it('should return null when API returns non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const service = await buildService(TEST_HOST, TEST_API_KEY);
      const result = await service.search('posts', 'test');
      expect(result).toBeNull();
    });

    it('should return null when API returns 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const service = await buildService(TEST_HOST, TEST_API_KEY);
      const result = await service.search('nonexistent', 'test');
      expect(result).toBeNull();
    });

    it('should return null when fetch throws network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const service = await buildService(TEST_HOST, TEST_API_KEY);
      const result = await service.search('posts', 'test');
      expect(result).toBeNull();
    });

    it('should return null when fetch throws non-Error', async () => {
      mockFetch.mockRejectedValue('string error');

      const service = await buildService(TEST_HOST, TEST_API_KEY);
      const result = await service.search('posts', 'test');
      expect(result).toBeNull();
    });

    it('should include AbortSignal.timeout(10000) in fetch call', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ hits: [], estimatedTotalHits: 0, processingTimeMs: 1, query: 'q' }),
      });

      const service = await buildService(TEST_HOST, TEST_API_KEY);
      await service.search('posts', 'test');

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.signal).toBeTruthy();
    });
  });

  describe('addDocuments', () => {
    beforeEach(() => {
      mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;
    });

    it('should skip when not available', async () => {
      const service = await buildService('', '');
      await service.addDocuments('posts', [{ id: 'p1', type: 'post' }]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip when documents array is empty', async () => {
      const service = await buildService(TEST_HOST, TEST_API_KEY);
      await service.addDocuments('posts', []);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should POST documents to correct index URL', async () => {
      const service = await buildService(TEST_HOST, TEST_API_KEY);
      const docs = [
        { id: 'post-1', type: 'post', content: 'Hello world' },
        { id: 'post-2', type: 'post', content: 'Another post' },
      ];

      await service.addDocuments('posts', docs);

      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_HOST}/indexes/posts/documents`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
          body: JSON.stringify(docs),
        }),
      );
    });

    it('should handle API error gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Server error'));
      const service = await buildService(TEST_HOST, TEST_API_KEY);

      await expect(
        service.addDocuments('posts', [{ id: 'p1', type: 'post' }]),
      ).resolves.not.toThrow();
    });

    it('should POST to correct index for different index names', async () => {
      const service = await buildService(TEST_HOST, TEST_API_KEY);
      await service.addDocuments('users', [{ id: 'u1', type: 'user', username: 'ahmad' }]);

      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_HOST}/indexes/users/documents`,
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('deleteDocument', () => {
    beforeEach(() => {
      mockFetch = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = mockFetch;
    });

    it('should skip when not available', async () => {
      const service = await buildService('', '');
      await service.deleteDocument('posts', 'post-1');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should DELETE with correct URL and auth header', async () => {
      const service = await buildService(TEST_HOST, TEST_API_KEY);
      await service.deleteDocument('posts', 'post-123');

      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_HOST}/indexes/posts/documents/post-123`,
        expect.objectContaining({
          method: 'DELETE',
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        }),
      );
    });

    it('should URL-encode index name and document ID', async () => {
      const service = await buildService(TEST_HOST, TEST_API_KEY);
      await service.deleteDocument('my index', 'doc/123');

      expect(mockFetch).toHaveBeenCalledWith(
        `${TEST_HOST}/indexes/my%20index/documents/doc%2F123`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should handle fetch error gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const service = await buildService(TEST_HOST, TEST_API_KEY);

      await expect(service.deleteDocument('posts', 'post-1')).resolves.not.toThrow();
    });

    it('should handle non-Error throw gracefully', async () => {
      mockFetch.mockRejectedValue('string error');
      const service = await buildService(TEST_HOST, TEST_API_KEY);

      await expect(service.deleteDocument('posts', 'post-1')).resolves.not.toThrow();
    });
  });

  describe('isAvailable', () => {
    it('should return true when host is configured', async () => {
      const service = await buildService(TEST_HOST, TEST_API_KEY);
      expect(service.isAvailable()).toBe(true);
    });

    it('should return false when host is empty string', async () => {
      const service = await buildService('', TEST_API_KEY);
      expect(service.isAvailable()).toBe(false);
    });
  });
});

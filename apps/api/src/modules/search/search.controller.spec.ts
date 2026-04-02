import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('SearchController', () => {
  let controller: SearchController;
  let service: jest.Mocked<SearchService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        ...globalMockProviders,
        {
          provide: SearchService,
          useValue: {
            search: jest.fn(),
            trending: jest.fn(),
            getHashtagPosts: jest.fn(),
            suggestedUsers: jest.fn(),
            searchPosts: jest.fn(),
            searchThreads: jest.fn(),
            searchReels: jest.fn(),
            getExploreFeed: jest.fn(),
            getSuggestions: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(SearchController);
    service = module.get(SearchService) as jest.Mocked<SearchService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('search', () => {
    it('should call searchService.search with validated params', async () => {
      service.search.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);

      await controller.search('islam', 'posts', 'cursor-1');

      expect(service.search).toHaveBeenCalledWith('islam', 'posts', 'cursor-1', 20, undefined);
    });

    it('should cap limit at 50', async () => {
      service.search.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);

      await controller.search('islam', 'posts', undefined, '999');

      expect(service.search).toHaveBeenCalledWith('islam', 'posts', undefined, 50, undefined);
    });

    it('should reject invalid type', async () => {
      service.search.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);

      await controller.search('islam', 'invalid');

      expect(service.search).toHaveBeenCalledWith('islam', undefined, undefined, 20, undefined);
    });
  });

  describe('trending', () => {
    it('should call searchService.trending', async () => {
      service.trending.mockResolvedValue([{ tag: 'ramadan', count: 100 }] as any);

      const result = await controller.trending();

      expect(service.trending).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('getHashtagPosts', () => {
    it('should call searchService.getHashtagPosts with tag and cursor', async () => {
      service.getHashtagPosts.mockResolvedValue({ data: [] } as any);

      await controller.getHashtagPosts('ramadan', 'cursor-1');

      expect(service.getHashtagPosts).toHaveBeenCalledWith('ramadan', 'cursor-1', undefined, undefined);
    });
  });

  describe('suggestedUsers', () => {
    it('should call searchService.suggestedUsers with userId', async () => {
      service.suggestedUsers.mockResolvedValue([{ id: 'user-2' }] as any);

      await controller.suggestedUsers(userId);

      expect(service.suggestedUsers).toHaveBeenCalledWith(userId);
    });
  });

  describe('querySuggestions', () => {
    it('should call searchService.getSuggestions with capped limit', async () => {
      service.getSuggestions.mockResolvedValue({ users: [], hashtags: [] } as any);

      await controller.querySuggestions('isl', '5');

      expect(service.getSuggestions).toHaveBeenCalledWith('isl', 5);
    });
  });

  // ═══ T10 Audit: Missing controller tests ═══

  describe('exploreFeed — #42 H', () => {
    it('should delegate to searchService.getExploreFeed with parsed limit', async () => {
      service.getExploreFeed.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);
      await controller.exploreFeed(undefined, '30', 'user-1');
      expect(service.getExploreFeed).toHaveBeenCalledWith(undefined, 30, 'user-1');
    });

    it('should cap limit at 50', async () => {
      service.getExploreFeed.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);
      await controller.exploreFeed(undefined, '999');
      expect(service.getExploreFeed).toHaveBeenCalledWith(undefined, 50, undefined);
    });

    it('should default limit to 20', async () => {
      service.getExploreFeed.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);
      await controller.exploreFeed();
      expect(service.getExploreFeed).toHaveBeenCalledWith(undefined, 20, undefined);
    });
  });

  describe('searchPosts — #43 M', () => {
    it('should delegate to searchService.searchPosts with parsed limit and userId', async () => {
      service.searchPosts.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);
      await controller.searchPosts('quran', 'cursor1', '15', 'user-1');
      expect(service.searchPosts).toHaveBeenCalledWith('quran', 'user-1', 'cursor1', 15);
    });

    it('should cap limit at 50', async () => {
      service.searchPosts.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);
      await controller.searchPosts('test', undefined, '999');
      expect(service.searchPosts).toHaveBeenCalledWith('test', undefined, undefined, 50);
    });
  });

  describe('searchThreads — #44 M', () => {
    it('should delegate to searchService.searchThreads with parsed limit and userId', async () => {
      service.searchThreads.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);
      await controller.searchThreads('islam', 'cursor1', '25', 'user-1');
      expect(service.searchThreads).toHaveBeenCalledWith('islam', 'cursor1', 25, 'user-1');
    });
  });

  describe('searchReels — #45 M', () => {
    it('should delegate to searchService.searchReels with parsed limit and userId', async () => {
      service.searchReels.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);
      await controller.searchReels('nasheed', 'cursor1', '10', 'user-1');
      expect(service.searchReels).toHaveBeenCalledWith('nasheed', 'cursor1', 10, 'user-1');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { HashtagsController } from './hashtags.controller';
import { HashtagsService } from './hashtags.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('HashtagsController', () => {
  let controller: HashtagsController;
  let service: jest.Mocked<HashtagsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HashtagsController],
      providers: [
        ...globalMockProviders,
        {
          provide: HashtagsService,
          useValue: {
            getTrendingRaw: jest.fn(),
            search: jest.fn(),
            getFollowedHashtags: jest.fn(),
            getByName: jest.fn(),
            getPostsByHashtag: jest.fn(),
            getReelsByHashtag: jest.fn(),
            getThreadsByHashtag: jest.fn(),
            followHashtag: jest.fn(),
            unfollowHashtag: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(HashtagsController);
    service = module.get(HashtagsService) as jest.Mocked<HashtagsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getTrending', () => {
    it('should call service.getTrendingRaw with default limit 50', async () => {
      service.getTrendingRaw.mockResolvedValue([{ name: 'ramadan', count: 100 }] as any);

      const result = await controller.getTrending();

      expect(service.getTrendingRaw).toHaveBeenCalledWith(50);
      expect(result).toHaveLength(1);
    });

    it('should parse and cap custom limit', async () => {
      service.getTrendingRaw.mockResolvedValue([] as any);

      await controller.getTrending('25');

      expect(service.getTrendingRaw).toHaveBeenCalledWith(25);
    });
  });

  describe('search', () => {
    it('should return empty data when query is falsy', async () => {
      const result = await controller.search('', undefined);

      expect(result).toEqual({ data: [], meta: { total: 0 } });
      expect(service.search).not.toHaveBeenCalled();
    });

    it('should call service.search with query and default limit 20', async () => {
      service.search.mockResolvedValue({ data: [{ name: 'islam' }], meta: { total: 1 } } as any);

      await controller.search('islam', undefined);

      expect(service.search).toHaveBeenCalledWith('islam', 20);
    });

    it('should parse custom limit', async () => {
      service.search.mockResolvedValue({ data: [], meta: { total: 0 } } as any);

      await controller.search('test', '10');

      expect(service.search).toHaveBeenCalledWith('test', 10);
    });
  });

  describe('getFollowedHashtags', () => {
    it('should call service.getFollowedHashtags with userId and cursor', async () => {
      service.getFollowedHashtags.mockResolvedValue({ data: [] } as any);

      await controller.getFollowedHashtags(userId, 'cursor-1');

      expect(service.getFollowedHashtags).toHaveBeenCalledWith(userId, 'cursor-1');
    });
  });

  describe('getByName', () => {
    it('should call service.getByName with hashtag name', async () => {
      service.getByName.mockResolvedValue({ id: 'h-1', name: 'ramadan', postsCount: 50 } as any);

      const result = await controller.getByName('ramadan');

      expect(service.getByName).toHaveBeenCalledWith('ramadan');
      expect(result).toEqual(expect.objectContaining({ name: 'ramadan' }));
    });
  });

  describe('getPosts', () => {
    it('should call service.getPostsByHashtag with name, userId, and cursor', async () => {
      service.getPostsByHashtag.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);

      await controller.getPosts('islam', userId, 'cursor-1');

      expect(service.getPostsByHashtag).toHaveBeenCalledWith('islam', userId, 'cursor-1');
    });
  });

  describe('getReels', () => {
    it('should call service.getReelsByHashtag with name, userId, and cursor', async () => {
      service.getReelsByHashtag.mockResolvedValue({ data: [] } as any);

      await controller.getReels('quran', userId, 'cursor-1');

      expect(service.getReelsByHashtag).toHaveBeenCalledWith('quran', userId, 'cursor-1');
    });
  });

  describe('getThreads', () => {
    it('should call service.getThreadsByHashtag with name, userId, and cursor', async () => {
      service.getThreadsByHashtag.mockResolvedValue({ data: [] } as any);

      await controller.getThreads('dhikr', userId, 'cursor-1');

      expect(service.getThreadsByHashtag).toHaveBeenCalledWith('dhikr', userId, 'cursor-1');
    });
  });

  describe('followHashtag', () => {
    it('should call service.followHashtag with userId and hashtagId', async () => {
      service.followHashtag.mockResolvedValue({ followed: true } as any);

      const result = await controller.followHashtag('h-1', userId);

      expect(service.followHashtag).toHaveBeenCalledWith(userId, 'h-1');
      expect(result).toEqual({ followed: true });
    });
  });

  describe('unfollowHashtag', () => {
    it('should call service.unfollowHashtag with userId and hashtagId', async () => {
      service.unfollowHashtag.mockResolvedValue({ unfollowed: true } as any);

      const result = await controller.unfollowHashtag('h-1', userId);

      expect(service.unfollowHashtag).toHaveBeenCalledWith(userId, 'h-1');
      expect(result).toEqual({ unfollowed: true });
    });
  });
});

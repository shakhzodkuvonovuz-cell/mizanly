import { Test, TestingModule } from '@nestjs/testing';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksService } from './bookmarks.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('BookmarksController', () => {
  let controller: BookmarksController;
  let service: jest.Mocked<BookmarksService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookmarksController],
      providers: [
        ...globalMockProviders,
        {
          provide: BookmarksService,
          useValue: {
            getCollections: jest.fn(),
            savePost: jest.fn(),
            getSavedPosts: jest.fn(),
            isPostSaved: jest.fn(),
            moveToCollection: jest.fn(),
            unsavePost: jest.fn(),
            getSavedThreads: jest.fn(),
            isThreadSaved: jest.fn(),
            saveThread: jest.fn(),
            unsaveThread: jest.fn(),
            getSavedVideos: jest.fn(),
            isVideoSaved: jest.fn(),
            saveVideo: jest.fn(),
            unsaveVideo: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(BookmarksController);
    service = module.get(BookmarksService) as jest.Mocked<BookmarksService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('getCollections', () => {
    it('should call service.getCollections with userId', async () => {
      const mockCols = [{ name: 'Read Later', count: 3 }];
      service.getCollections.mockResolvedValue(mockCols as any);

      const result = await controller.getCollections(userId);

      expect(service.getCollections).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockCols);
    });
  });

  describe('savePost', () => {
    it('should call service.savePost with userId, postId, and collectionName', async () => {
      service.savePost.mockResolvedValue({ saved: true } as any);

      const result = await controller.savePost(userId, { postId: 'post-1', collectionName: 'Favorites' } as any);

      expect(service.savePost).toHaveBeenCalledWith(userId, 'post-1', 'Favorites');
      expect(result).toEqual({ saved: true });
    });
  });

  describe('getSavedPosts', () => {
    it('should call service.getSavedPosts with all params', async () => {
      const mockPosts = { data: [{ id: 'post-1' }], meta: { cursor: null, hasMore: false } };
      service.getSavedPosts.mockResolvedValue(mockPosts as any);

      const result = await controller.getSavedPosts(userId, 'Favorites', 'cursor-1', 10);

      expect(service.getSavedPosts).toHaveBeenCalledWith(userId, 'Favorites', 'cursor-1', 10);
      expect(result).toEqual(mockPosts);
    });
  });

  describe('isPostSaved', () => {
    it('should call service.isPostSaved with userId and postId', async () => {
      service.isPostSaved.mockResolvedValue({ saved: true } as any);

      const result = await controller.isPostSaved(userId, 'post-1');

      expect(service.isPostSaved).toHaveBeenCalledWith(userId, 'post-1');
      expect(result).toEqual({ saved: true });
    });
  });

  describe('moveToCollection', () => {
    it('should call service.moveToCollection with userId, postId, and collectionName', async () => {
      service.moveToCollection.mockResolvedValue({ moved: true } as any);

      const result = await controller.moveToCollection(userId, 'post-1', { collectionName: 'Read Later' } as any);

      expect(service.moveToCollection).toHaveBeenCalledWith(userId, 'post-1', 'Read Later');
      expect(result).toEqual({ moved: true });
    });
  });

  describe('unsavePost', () => {
    it('should call service.unsavePost with userId and postId', async () => {
      service.unsavePost.mockResolvedValue(undefined as any);

      await controller.unsavePost(userId, 'post-1');

      expect(service.unsavePost).toHaveBeenCalledWith(userId, 'post-1');
    });
  });

  describe('saveThread', () => {
    it('should call service.saveThread with userId and threadId', async () => {
      service.saveThread.mockResolvedValue({ saved: true } as any);

      const result = await controller.saveThread(userId, 'thread-1');

      expect(service.saveThread).toHaveBeenCalledWith(userId, 'thread-1');
      expect(result).toEqual({ saved: true });
    });
  });

  describe('unsaveThread', () => {
    it('should call service.unsaveThread with userId and threadId', async () => {
      service.unsaveThread.mockResolvedValue(undefined as any);

      await controller.unsaveThread(userId, 'thread-1');

      expect(service.unsaveThread).toHaveBeenCalledWith(userId, 'thread-1');
    });
  });

  describe('saveVideo', () => {
    it('should call service.saveVideo with userId and videoId', async () => {
      service.saveVideo.mockResolvedValue({ saved: true } as any);

      const result = await controller.saveVideo(userId, 'video-1');

      expect(service.saveVideo).toHaveBeenCalledWith(userId, 'video-1');
      expect(result).toEqual({ saved: true });
    });
  });

  describe('unsaveVideo', () => {
    it('should call service.unsaveVideo with userId and videoId', async () => {
      service.unsaveVideo.mockResolvedValue(undefined as any);

      await controller.unsaveVideo(userId, 'video-1');

      expect(service.unsaveVideo).toHaveBeenCalledWith(userId, 'video-1');
    });
  });
});

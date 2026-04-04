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
            savePost: jest.fn().mockResolvedValue({ id: 'b1' }),
            unsavePost: jest.fn().mockResolvedValue({ removed: true }),
            getSavedPosts: jest.fn().mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } }),
            isPostSaved: jest.fn().mockResolvedValue({ saved: true }),
            getCollections: jest.fn().mockResolvedValue([]),
            moveToCollection: jest.fn().mockResolvedValue({ moved: true }),
            getSavedThreads: jest.fn().mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } }),
            isThreadSaved: jest.fn().mockResolvedValue({ saved: true }),
            saveThread: jest.fn().mockResolvedValue({ id: 'bt1' }),
            unsaveThread: jest.fn().mockResolvedValue({ removed: true }),
            getSavedVideos: jest.fn().mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } }),
            isVideoSaved: jest.fn().mockResolvedValue({ saved: true }),
            saveVideo: jest.fn().mockResolvedValue({ id: 'bv1' }),
            unsaveVideo: jest.fn().mockResolvedValue({ removed: true }),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();
    controller = module.get(BookmarksController);
    service = module.get(BookmarksService) as jest.Mocked<BookmarksService>;
  });

  afterEach(() => jest.clearAllMocks());

  it('route prefix is bookmarks', () => {
    const path = Reflect.getMetadata('path', BookmarksController);
    expect(path).toBe('bookmarks');
  });

  describe('savePost', () => {
    it('delegates to service.savePost', async () => {
      await controller.savePost(userId, { postId: 'p1', collectionName: 'default' } as any);
      expect(service.savePost).toHaveBeenCalledWith(userId, 'p1', 'default');
    });
  });

  describe('getSavedPosts', () => {
    it('delegates to service.getSavedPosts with all params', async () => {
      await controller.getSavedPosts(userId, 'favorites', 'cursor-1', 20);
      expect(service.getSavedPosts).toHaveBeenCalledWith(userId, 'favorites', 'cursor-1', 20);
    });
  });

  describe('isPostSaved', () => {
    it('delegates to service.isPostSaved', async () => {
      const result = await controller.isPostSaved(userId, 'p1');
      expect(service.isPostSaved).toHaveBeenCalledWith(userId, 'p1');
      expect(result).toEqual({ saved: true });
    });
  });

  describe('moveToCollection', () => {
    it('delegates to service.moveToCollection', async () => {
      await controller.moveToCollection(userId, 'p1', { collectionName: 'work' } as any);
      expect(service.moveToCollection).toHaveBeenCalledWith(userId, 'p1', 'work');
    });
  });

  describe('unsavePost', () => {
    it('delegates to service.unsavePost', async () => {
      await controller.unsavePost(userId, 'p1');
      expect(service.unsavePost).toHaveBeenCalledWith(userId, 'p1');
    });
  });

  describe('getCollections', () => {
    it('delegates to service.getCollections', async () => {
      await controller.getCollections(userId);
      expect(service.getCollections).toHaveBeenCalledWith(userId);
    });
  });

  describe('getSavedThreads', () => {
    it('delegates to service.getSavedThreads', async () => {
      await controller.getSavedThreads(userId, 'cursor-1', 10);
      expect(service.getSavedThreads).toHaveBeenCalledWith(userId, 'cursor-1', 10);
    });
  });

  describe('isThreadSaved', () => {
    it('delegates to service.isThreadSaved', async () => {
      const result = await controller.isThreadSaved(userId, 'thread-1');
      expect(service.isThreadSaved).toHaveBeenCalledWith(userId, 'thread-1');
      expect(result).toEqual({ saved: true });
    });
  });

  describe('saveThread', () => {
    it('delegates to service.saveThread', async () => {
      await controller.saveThread(userId, 'thread-1');
      expect(service.saveThread).toHaveBeenCalledWith(userId, 'thread-1');
    });
  });

  describe('unsaveThread', () => {
    it('delegates to service.unsaveThread', async () => {
      await controller.unsaveThread(userId, 'thread-1');
      expect(service.unsaveThread).toHaveBeenCalledWith(userId, 'thread-1');
    });
  });

  describe('getSavedVideos', () => {
    it('delegates to service.getSavedVideos', async () => {
      await controller.getSavedVideos(userId, 'cursor-1', 10);
      expect(service.getSavedVideos).toHaveBeenCalledWith(userId, 'cursor-1', 10);
    });
  });

  describe('isVideoSaved', () => {
    it('delegates to service.isVideoSaved', async () => {
      const result = await controller.isVideoSaved(userId, 'vid-1');
      expect(service.isVideoSaved).toHaveBeenCalledWith(userId, 'vid-1');
      expect(result).toEqual({ saved: true });
    });
  });

  describe('saveVideo', () => {
    it('delegates to service.saveVideo', async () => {
      await controller.saveVideo(userId, 'vid-1');
      expect(service.saveVideo).toHaveBeenCalledWith(userId, 'vid-1');
    });
  });

  describe('unsaveVideo', () => {
    it('delegates to service.unsaveVideo', async () => {
      await controller.unsaveVideo(userId, 'vid-1');
      expect(service.unsaveVideo).toHaveBeenCalledWith(userId, 'vid-1');
    });
  });
});

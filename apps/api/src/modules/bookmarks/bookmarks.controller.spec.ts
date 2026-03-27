import { Test, TestingModule } from '@nestjs/testing';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksService } from './bookmarks.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('BookmarksController', () => {
  let controller: BookmarksController;
  let service: any;
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookmarksController],
      providers: [...globalMockProviders, {
        provide: BookmarksService, useValue: {
          savePost: jest.fn().mockResolvedValue({ id: 'b1' }),
          unsavePost: jest.fn().mockResolvedValue({ removed: true }),
          getSavedPosts: jest.fn().mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } }),
          isPostSaved: jest.fn().mockResolvedValue({ saved: true }),
          getCollections: jest.fn().mockResolvedValue([]),
        },
      }],
    }).compile();
    controller = module.get(BookmarksController);
    service = module.get(BookmarksService);
  });
  it('route prefix is bookmarks (no double prefix)', () => {
    const path = Reflect.getMetadata('path', BookmarksController);
    expect(path).toBe('bookmarks');
  });
  it('should save a post', async () => {
    await controller.savePost('u1', { postId: 'p1', collectionName: 'default' } as any);
    expect(service.savePost).toHaveBeenCalledWith('u1', 'p1', 'default');
  });
  it('should check post saved status', async () => {
    const result = await controller.isPostSaved('u1', 'p1');
    expect(result).toEqual({ saved: true });
  });
  it('should get collections', async () => {
    await controller.getCollections('u1');
    expect(service.getCollections).toHaveBeenCalledWith('u1');
  });
});

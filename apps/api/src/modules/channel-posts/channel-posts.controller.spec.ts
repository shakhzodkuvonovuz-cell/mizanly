import { Test, TestingModule } from '@nestjs/testing';
import { ChannelPostsController } from './channel-posts.controller';
import { ChannelPostsService } from './channel-posts.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ChannelPostsController', () => {
  let controller: ChannelPostsController;
  let service: ChannelPostsService;

  const mockService = {
    create: jest.fn(),
    getFeed: jest.fn(),
    getById: jest.fn(),
    delete: jest.fn(),
    pin: jest.fn(),
    unpin: jest.fn(),
    like: jest.fn(),
    unlike: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChannelPostsController],
      providers: [
        ...globalMockProviders,
        { provide: ChannelPostsService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<ChannelPostsController>(ChannelPostsController);
    service = module.get<ChannelPostsService>(ChannelPostsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto = { content: 'Hello' };
      const expected = { id: 'post-1' };
      mockService.create.mockResolvedValue(expected);
      const result = await controller.create('channel-1', 'user-1', dto as any);
      expect(service.create).toHaveBeenCalledWith('channel-1', 'user-1', dto);
      expect(result).toEqual(expected);
    });
  });

  describe('getFeed', () => {
    it('should call service.getFeed', async () => {
      const expected = { data: [], meta: { cursor: null, hasMore: false } };
      mockService.getFeed.mockResolvedValue(expected);
      const result = await controller.getFeed('channel-1', undefined);
      expect(service.getFeed).toHaveBeenCalledWith('channel-1', undefined);
      expect(result).toEqual(expected);
    });
  });

  describe('getById', () => {
    it('should call service.getById', async () => {
      const expected = { id: 'post-1' };
      mockService.getById.mockResolvedValue(expected);
      const result = await controller.getById('post-1');
      expect(service.getById).toHaveBeenCalledWith('post-1');
      expect(result).toEqual(expected);
    });
  });

  describe('delete', () => {
    it('should call service.delete', async () => {
      mockService.delete.mockResolvedValue({ deleted: true });
      await controller.delete('post-1', 'user-1');
      expect(service.delete).toHaveBeenCalledWith('post-1', 'user-1');
    });
  });

  describe('pin', () => {
    it('should call service.pin', async () => {
      mockService.pin.mockResolvedValue({ isPinned: true });
      await controller.pin('post-1', 'user-1');
      expect(service.pin).toHaveBeenCalledWith('post-1', 'user-1');
    });
  });

  describe('unpin', () => {
    it('should call service.unpin', async () => {
      mockService.unpin.mockResolvedValue({ isPinned: false });
      await controller.unpin('post-1', 'user-1');
      expect(service.unpin).toHaveBeenCalledWith('post-1', 'user-1');
    });
  });

  describe('like', () => {
    it('should call service.like', async () => {
      mockService.like.mockResolvedValue({ liked: true });
      await controller.like('post-1', 'user-1');
      expect(service.like).toHaveBeenCalledWith('post-1', 'user-1');
    });
  });

  describe('unlike', () => {
    it('should call service.unlike', async () => {
      mockService.unlike.mockResolvedValue({ unliked: true });
      await controller.unlike('post-1', 'user-1');
      expect(service.unlike).toHaveBeenCalledWith('post-1', 'user-1');
    });
  });
});
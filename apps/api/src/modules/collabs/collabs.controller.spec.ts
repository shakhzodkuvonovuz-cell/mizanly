import { Test, TestingModule } from '@nestjs/testing';
import { CollabsController } from './collabs.controller';
import { CollabsService } from './collabs.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CollabsController', () => {
  let controller: CollabsController;
  let service: CollabsService;

  const mockService = {
    invite: jest.fn(),
    accept: jest.fn(),
    decline: jest.fn(),
    remove: jest.fn(),
    getMyPending: jest.fn(),
    getPostCollabs: jest.fn(),
    getAcceptedCollabs: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollabsController],
      providers: [
        ...globalMockProviders,
        { provide: CollabsService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<CollabsController>(CollabsController);
    service = module.get<CollabsService>(CollabsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('invite', () => {
    it('should call service.invite', async () => {
      const dto = { postId: 'post-1', targetUserId: 'user-2' };
      const expected = { id: 'collab-1' };
      mockService.invite.mockResolvedValue(expected);
      const result = await controller.invite('user-1', dto as any);
      expect(service.invite).toHaveBeenCalledWith('user-1', dto.postId, dto.targetUserId);
      expect(result).toEqual(expected);
    });
  });

  describe('accept', () => {
    it('should call service.accept', async () => {
      mockService.accept.mockResolvedValue({ accepted: true });
      await controller.accept('collab-1', 'user-1');
      expect(service.accept).toHaveBeenCalledWith('collab-1', 'user-1');
    });
  });

  describe('decline', () => {
    it('should call service.decline', async () => {
      mockService.decline.mockResolvedValue({ declined: true });
      await controller.decline('collab-1', 'user-1');
      expect(service.decline).toHaveBeenCalledWith('collab-1', 'user-1');
    });
  });

  describe('remove', () => {
    it('should call service.remove', async () => {
      mockService.remove.mockResolvedValue({ removed: true });
      await controller.remove('collab-1', 'user-1');
      expect(service.remove).toHaveBeenCalledWith('collab-1', 'user-1');
    });
  });

  describe('pending', () => {
    it('should call service.getMyPending', async () => {
      const expected = [{ id: 'collab-1' }];
      mockService.getMyPending.mockResolvedValue(expected);
      const result = await controller.pending('user-1');
      expect(service.getMyPending).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(expected);
    });
  });

  describe('accepted', () => {
    it('should call service.getAcceptedCollabs', async () => {
      const expected = { data: [], meta: { cursor: null, hasMore: false } };
      mockService.getAcceptedCollabs.mockResolvedValue(expected);
      const result = await controller.accepted('user-1', undefined);
      expect(service.getAcceptedCollabs).toHaveBeenCalledWith('user-1', undefined);
      expect(result).toEqual(expected);
    });
  });

  describe('postCollabs', () => {
    it('should call service.getPostCollabs', async () => {
      const expected = [{ id: 'collab-1' }];
      mockService.getPostCollabs.mockResolvedValue(expected);
      const result = await controller.postCollabs('post-1');
      expect(service.getPostCollabs).toHaveBeenCalledWith('post-1');
      expect(result).toEqual(expected);
    });
  });
});
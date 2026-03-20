import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('FollowsController', () => {
  let controller: FollowsController;
  let service: jest.Mocked<FollowsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FollowsController],
      providers: [
        ...globalMockProviders,
        {
          provide: FollowsService,
          useValue: {
            follow: jest.fn(),
            unfollow: jest.fn(),
            getFollowers: jest.fn(),
            getFollowing: jest.fn(),
            getOwnRequests: jest.fn(),
            acceptRequest: jest.fn(),
            declineRequest: jest.fn(),
            cancelRequest: jest.fn(),
            getSuggestions: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(FollowsController);
    service = module.get(FollowsService) as jest.Mocked<FollowsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('follow', () => {
    it('should call followsService.follow with currentUserId and targetUserId', async () => {
      service.follow.mockResolvedValue({ following: true } as any);

      const result = await controller.follow(userId, 'user-456');

      expect(service.follow).toHaveBeenCalledWith(userId, 'user-456');
      expect(result).toEqual({ following: true });
    });

    it('should propagate BadRequestException when following self', async () => {
      service.follow.mockRejectedValue(new BadRequestException('Cannot follow yourself'));

      await expect(controller.follow(userId, userId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('unfollow', () => {
    it('should call followsService.unfollow with currentUserId and targetUserId', async () => {
      service.unfollow.mockResolvedValue({ unfollowed: true } as any);

      const result = await controller.unfollow(userId, 'user-456');

      expect(service.unfollow).toHaveBeenCalledWith(userId, 'user-456');
      expect(result).toEqual({ unfollowed: true });
    });
  });

  describe('getFollowers', () => {
    it('should call followsService.getFollowers with userId and cursor', async () => {
      service.getFollowers.mockResolvedValue({ data: [{ id: 'user-2' }], meta: { cursor: null, hasMore: false } } as any);

      const result = await controller.getFollowers('user-456', 'cursor-1');

      expect(service.getFollowers).toHaveBeenCalledWith('user-456', 'cursor-1');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('getFollowing', () => {
    it('should call followsService.getFollowing with userId and cursor', async () => {
      service.getFollowing.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } } as any);

      await controller.getFollowing('user-456', 'cursor-1');

      expect(service.getFollowing).toHaveBeenCalledWith('user-456', 'cursor-1');
    });
  });

  describe('getOwnRequests', () => {
    it('should call followsService.getOwnRequests with userId', async () => {
      service.getOwnRequests.mockResolvedValue([{ id: 'req-1' }] as any);

      const result = await controller.getOwnRequests(userId);

      expect(service.getOwnRequests).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });

  describe('acceptRequest', () => {
    it('should call followsService.acceptRequest with userId and requestId', async () => {
      service.acceptRequest.mockResolvedValue({ accepted: true } as any);

      const result = await controller.acceptRequest(userId, 'req-1');

      expect(service.acceptRequest).toHaveBeenCalledWith(userId, 'req-1');
      expect(result).toEqual({ accepted: true });
    });
  });

  describe('declineRequest', () => {
    it('should call followsService.declineRequest with userId and requestId', async () => {
      service.declineRequest.mockResolvedValue({ declined: true } as any);

      const result = await controller.declineRequest(userId, 'req-1');

      expect(service.declineRequest).toHaveBeenCalledWith(userId, 'req-1');
      expect(result).toEqual({ declined: true });
    });
  });

  describe('cancelRequest', () => {
    it('should call followsService.cancelRequest with userId and requestId', async () => {
      service.cancelRequest.mockResolvedValue({ cancelled: true } as any);

      const result = await controller.cancelRequest(userId, 'req-1');

      expect(service.cancelRequest).toHaveBeenCalledWith(userId, 'req-1');
      expect(result).toEqual({ cancelled: true });
    });
  });

  describe('getSuggestions', () => {
    it('should call followsService.getSuggestions with userId', async () => {
      service.getSuggestions.mockResolvedValue([{ id: 'user-2', mutualCount: 3 }] as any);

      const result = await controller.getSuggestions(userId);

      expect(service.getSuggestions).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });
});

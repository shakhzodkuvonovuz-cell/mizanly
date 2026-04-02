import { Test, TestingModule } from '@nestjs/testing';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

/**
 * W7-T5 / T09 #38: Controller test for removeFollower endpoint
 */
describe('FollowsController — W7 T09 gaps', () => {
  let controller: FollowsController;
  let service: jest.Mocked<FollowsService>;

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
            removeFollower: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(FollowsController);
    service = module.get(FollowsService) as jest.Mocked<FollowsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('removeFollower', () => {
    it('should call followsService.removeFollower with currentUserId and followerUserId', async () => {
      service.removeFollower.mockResolvedValue({ message: 'Follower removed' } as any);

      const result = await controller.removeFollower('user-1', 'follower-1');

      expect(service.removeFollower).toHaveBeenCalledWith('user-1', 'follower-1');
      expect(result).toEqual({ message: 'Follower removed' });
    });
  });
});

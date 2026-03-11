import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaService } from '../../config/prisma.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockService = {
    getMe: jest.fn(),
    touchLastSeen: jest.fn(),
    updateProfile: jest.fn(),
    deactivate: jest.fn(),
    deleteAccount: jest.fn(),
    getSavedPosts: jest.fn(),
    getSavedThreads: jest.fn(),
    getSavedReels: jest.fn(),
    getSavedVideos: jest.fn(),
    getFollowRequests: jest.fn(),
    getWatchLater: jest.fn(),
    addWatchLater: jest.fn(),
    removeWatchLater: jest.fn(),
    getWatchHistory: jest.fn(),
    clearWatchHistory: jest.fn(),
    getDrafts: jest.fn(),
    getQrCode: jest.fn(),
    getAnalytics: jest.fn(),
    getProfile: jest.fn(),
    getUserPosts: jest.fn(),
    getUserThreads: jest.fn(),
    getFollowers: jest.fn(),
    getFollowing: jest.fn(),
    report: jest.fn(),
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'CLERK_SECRET_KEY' ? 'test-secret' : null),
    };
    const mockPrismaService = {};

    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(UsersController);
    service = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMe', () => {
    it('should call service.touchLastSeen and service.getMe with userId', async () => {
      mockService.getMe.mockResolvedValue({ id: 'user-1' });
      const result = await controller.getMe('user-1');
      expect(mockService.touchLastSeen).toHaveBeenCalledWith('user-1');
      expect(mockService.getMe).toHaveBeenCalledWith('user-1');
    });
  });

  describe('updateProfile', () => {
    it('should call service.updateProfile with userId and dto', async () => {
      const dto = { bio: 'test' } as any;
      mockService.updateProfile.mockResolvedValue({ updated: true });
      await controller.updateProfile('user-1', dto);
      expect(mockService.updateProfile).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('deactivate', () => {
    it('should call service.deactivate with userId', async () => {
      mockService.deactivate.mockResolvedValue({ deactivated: true });
      await controller.deactivate('user-1');
      expect(mockService.deactivate).toHaveBeenCalledWith('user-1');
    });
  });

  describe('deleteAccount', () => {
    it('should call service.deleteAccount with userId', async () => {
      mockService.deleteAccount.mockResolvedValue({ deleted: true });
      await controller.deleteAccount('user-1');
      expect(mockService.deleteAccount).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getSavedPosts', () => {
    it('should call service.getSavedPosts with userId and cursor', async () => {
      mockService.getSavedPosts.mockResolvedValue({ data: [] });
      await controller.getSavedPosts('user-1', 'cursor-1');
      expect(mockService.getSavedPosts).toHaveBeenCalledWith('user-1', 'cursor-1');
    });
  });

  describe('getSavedThreads', () => {
    it('should call service.getSavedThreads with userId and cursor', async () => {
      mockService.getSavedThreads.mockResolvedValue({ data: [] });
      await controller.getSavedThreads('user-1', 'cursor-1');
      expect(mockService.getSavedThreads).toHaveBeenCalledWith('user-1', 'cursor-1');
    });
  });

  describe('getSavedReels', () => {
    it('should call service.getSavedReels with userId and cursor', async () => {
      mockService.getSavedReels.mockResolvedValue({ data: [] });
      await controller.getSavedReels('user-1', 'cursor-1');
      expect(mockService.getSavedReels).toHaveBeenCalledWith('user-1', 'cursor-1');
    });
  });

  describe('getSavedVideos', () => {
    it('should call service.getSavedVideos with userId and cursor', async () => {
      mockService.getSavedVideos.mockResolvedValue({ data: [] });
      await controller.getSavedVideos('user-1', 'cursor-1');
      expect(mockService.getSavedVideos).toHaveBeenCalledWith('user-1', 'cursor-1');
    });
  });

  describe('getFollowRequests', () => {
    it('should call service.getFollowRequests with userId and cursor', async () => {
      mockService.getFollowRequests.mockResolvedValue({ data: [] });
      await controller.getFollowRequests('user-1', 'cursor-1');
      expect(mockService.getFollowRequests).toHaveBeenCalledWith('user-1', 'cursor-1');
    });
  });

  describe('getWatchLater', () => {
    it('should call service.getWatchLater with userId and cursor', async () => {
      mockService.getWatchLater.mockResolvedValue({ data: [] });
      await controller.getWatchLater('user-1', 'cursor-1');
      expect(mockService.getWatchLater).toHaveBeenCalledWith('user-1', 'cursor-1');
    });
  });

  describe('addWatchLater', () => {
    it('should call service.addWatchLater with userId and videoId', async () => {
      mockService.addWatchLater.mockResolvedValue({ added: true });
      await controller.addWatchLater('video-1', 'user-1');
      expect(mockService.addWatchLater).toHaveBeenCalledWith('user-1', 'video-1');
    });
  });

  describe('removeWatchLater', () => {
    it('should call service.removeWatchLater with userId and videoId', async () => {
      mockService.removeWatchLater.mockResolvedValue({ removed: true });
      await controller.removeWatchLater('video-1', 'user-1');
      expect(mockService.removeWatchLater).toHaveBeenCalledWith('user-1', 'video-1');
    });
  });

  describe('getWatchHistory', () => {
    it('should call service.getWatchHistory with userId and cursor', async () => {
      mockService.getWatchHistory.mockResolvedValue({ data: [] });
      await controller.getWatchHistory('user-1', 'cursor-1');
      expect(mockService.getWatchHistory).toHaveBeenCalledWith('user-1', 'cursor-1');
    });
  });

  describe('clearWatchHistory', () => {
    it('should call service.clearWatchHistory with userId', async () => {
      mockService.clearWatchHistory.mockResolvedValue({ cleared: true });
      await controller.clearWatchHistory('user-1');
      expect(mockService.clearWatchHistory).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getDrafts', () => {
    it('should call service.getDrafts with userId', async () => {
      mockService.getDrafts.mockResolvedValue({ data: [] });
      await controller.getDrafts('user-1');
      expect(mockService.getDrafts).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getQrCode', () => {
    it('should call service.getQrCode with userId', async () => {
      mockService.getQrCode.mockResolvedValue({ qr: 'data' });
      await controller.getQrCode('user-1');
      expect(mockService.getQrCode).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getAnalytics', () => {
    it('should call service.getAnalytics with userId', async () => {
      mockService.getAnalytics.mockResolvedValue({ analytics: {} });
      await controller.getAnalytics('user-1');
      expect(mockService.getAnalytics).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getProfile', () => {
    it('should call service.getProfile with username and currentUserId', async () => {
      mockService.getProfile.mockResolvedValue({ id: 'user-1' });
      const result = await controller.getProfile('username', 'viewer-1');
      expect(mockService.getProfile).toHaveBeenCalledWith('username', 'viewer-1');
    });
  });

  describe('getUserPosts', () => {
    it('should call service.getUserPosts with username, cursor, and viewerId', async () => {
      mockService.getUserPosts.mockResolvedValue({ data: [] });
      await controller.getUserPosts('username', 'viewer-1', 'cursor-1');
      expect(mockService.getUserPosts).toHaveBeenCalledWith('username', 'cursor-1', 'viewer-1');
    });
  });

  describe('getUserThreads', () => {
    it('should call service.getUserThreads with username, cursor, and viewerId', async () => {
      mockService.getUserThreads.mockResolvedValue({ data: [] });
      await controller.getUserThreads('username', 'viewer-1', 'cursor-1');
      expect(mockService.getUserThreads).toHaveBeenCalledWith('username', 'cursor-1', 'viewer-1');
    });
  });

  describe('getFollowers', () => {
    it('should call service.getFollowers with username and cursor', async () => {
      mockService.getFollowers.mockResolvedValue({ data: [] });
      await controller.getFollowers('username', 'cursor-1');
      expect(mockService.getFollowers).toHaveBeenCalledWith('username', 'cursor-1');
    });
  });

  describe('getFollowing', () => {
    it('should call service.getFollowing with username and cursor', async () => {
      mockService.getFollowing.mockResolvedValue({ data: [] });
      await controller.getFollowing('username', 'cursor-1');
      expect(mockService.getFollowing).toHaveBeenCalledWith('username', 'cursor-1');
    });
  });

  describe('report', () => {
    it('should call service.report with reporterId, reportedId, and reason', async () => {
      mockService.report.mockResolvedValue({ reported: true });
      await controller.report('reported-1', 'reporter-1', { reason: 'spam' });
      expect(mockService.report).toHaveBeenCalledWith('reporter-1', 'reported-1', 'spam');
    });
  });
});
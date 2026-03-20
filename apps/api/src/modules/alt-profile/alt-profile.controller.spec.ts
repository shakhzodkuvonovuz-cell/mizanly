import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { AltProfileController, AltProfileViewerController } from './alt-profile.controller';
import { AltProfileService } from './alt-profile.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('AltProfileController', () => {
  let controller: AltProfileController;
  let service: jest.Mocked<AltProfileService>;

  const userId = 'user-123';

  const mockServiceValue = {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getOwn: jest.fn(),
    addAccess: jest.fn(),
    removeAccess: jest.fn(),
    getAccessList: jest.fn(),
    getAltPosts: jest.fn(),
    getForUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AltProfileController],
      providers: [
        ...globalMockProviders,
        { provide: AltProfileService, useValue: mockServiceValue },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(AltProfileController);
    service = module.get(AltProfileService) as jest.Mocked<AltProfileService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should call altProfile.create with userId and dto', async () => {
      const dto = { displayName: 'Alt Me', bio: 'My secret side' };
      const mockProfile = { id: 'alt-1', userId, ...dto };
      service.create.mockResolvedValue(mockProfile as any);

      const result = await controller.create(userId, dto as any);

      expect(service.create).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ displayName: 'Alt Me' }));
    });
  });

  describe('update', () => {
    it('should call altProfile.update with userId and dto', async () => {
      const dto = { displayName: 'Updated Alt' };
      service.update.mockResolvedValue({ id: 'alt-1', displayName: 'Updated Alt' } as any);

      const result = await controller.update(userId, dto as any);

      expect(service.update).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ displayName: 'Updated Alt' }));
    });
  });

  describe('remove', () => {
    it('should call altProfile.delete with userId', async () => {
      service.delete.mockResolvedValue({ deleted: true } as any);

      const result = await controller.remove(userId);

      expect(service.delete).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ deleted: true }));
    });
  });

  describe('getOwn', () => {
    it('should call altProfile.getOwn with userId', async () => {
      const mockProfile = { id: 'alt-1', userId, displayName: 'Alt Me' };
      service.getOwn.mockResolvedValue(mockProfile as any);

      const result = await controller.getOwn(userId);

      expect(service.getOwn).toHaveBeenCalledWith(userId);
      expect(result).toEqual(expect.objectContaining({ id: 'alt-1' }));
    });

    it('should propagate NotFoundException when no alt profile', async () => {
      service.getOwn.mockRejectedValue(new NotFoundException('No alt profile'));

      await expect(controller.getOwn(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('addAccess', () => {
    it('should call altProfile.addAccess with userId and userIds array', async () => {
      service.addAccess.mockResolvedValue({ granted: 2 } as any);

      const result = await controller.addAccess(userId, { userIds: ['user-2', 'user-3'] });

      expect(service.addAccess).toHaveBeenCalledWith(userId, ['user-2', 'user-3']);
      expect(result).toEqual({ granted: 2 });
    });
  });

  describe('removeAccess', () => {
    it('should call altProfile.removeAccess with userId and targetUserId', async () => {
      service.removeAccess.mockResolvedValue({ removed: true } as any);

      const result = await controller.removeAccess(userId, 'user-2');

      expect(service.removeAccess).toHaveBeenCalledWith(userId, 'user-2');
      expect(result).toEqual({ removed: true });
    });
  });

  describe('getAccessList', () => {
    it('should call altProfile.getAccessList with userId', async () => {
      const mockList = [{ userId: 'user-2', username: 'friend1' }];
      service.getAccessList.mockResolvedValue(mockList as any);

      const result = await controller.getAccessList(userId);

      expect(service.getAccessList).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockList);
    });
  });

  describe('getOwnPosts', () => {
    it('should call altProfile.getAltPosts with userId as both owner and viewer', async () => {
      const mockPosts = { data: [{ id: 'post-1' }], meta: { cursor: null, hasMore: false } };
      service.getAltPosts.mockResolvedValue(mockPosts as any);

      const result = await controller.getOwnPosts(userId, 'cursor-1');

      expect(service.getAltPosts).toHaveBeenCalledWith(userId, userId, 'cursor-1');
      expect(result).toEqual(mockPosts);
    });
  });
});

describe('AltProfileViewerController', () => {
  let controller: AltProfileViewerController;
  let service: jest.Mocked<AltProfileService>;

  const viewerId = 'viewer-1';
  const targetUserId = 'target-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AltProfileViewerController],
      providers: [
        ...globalMockProviders,
        {
          provide: AltProfileService,
          useValue: {
            getForUser: jest.fn(),
            getAltPosts: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(AltProfileViewerController);
    service = module.get(AltProfileService) as jest.Mocked<AltProfileService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('viewProfile', () => {
    it('should call altProfile.getForUser with targetUserId and viewerId', async () => {
      const mockProfile = { id: 'alt-1', displayName: 'Alt User' };
      service.getForUser.mockResolvedValue(mockProfile as any);

      const result = await controller.viewProfile(viewerId, targetUserId);

      expect(service.getForUser).toHaveBeenCalledWith(targetUserId, viewerId);
      expect(result).toEqual(expect.objectContaining({ displayName: 'Alt User' }));
    });

    it('should propagate ForbiddenException when viewer has no access', async () => {
      service.getForUser.mockRejectedValue(new ForbiddenException('No access'));

      await expect(controller.viewProfile(viewerId, targetUserId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('viewPosts', () => {
    it('should call altProfile.getAltPosts with targetUserId and viewerId', async () => {
      const mockPosts = { data: [{ id: 'post-1' }], meta: { cursor: null, hasMore: false } };
      service.getAltPosts.mockResolvedValue(mockPosts as any);

      const result = await controller.viewPosts(viewerId, targetUserId, 'cursor-1');

      expect(service.getAltPosts).toHaveBeenCalledWith(targetUserId, viewerId, 'cursor-1');
      expect(result).toEqual(mockPosts);
    });
  });
});

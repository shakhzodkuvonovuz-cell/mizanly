import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ClipsController', () => {
  let controller: ClipsController;
  let service: jest.Mocked<ClipsService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClipsController],
      providers: [
        ...globalMockProviders,
        {
          provide: ClipsService,
          useValue: {
            create: jest.fn(),
            getByVideo: jest.fn(),
            getByUser: jest.fn(),
            delete: jest.fn(),
            getShareLink: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ClipsController);
    service = module.get(ClipsService) as jest.Mocked<ClipsService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should call clipsService.create with userId, videoId, and dto', async () => {
      const dto = { startTime: 10, endTime: 30, title: 'Best moment' };
      service.create.mockResolvedValue({ id: 'clip-1', videoId: 'vid-1', ...dto } as any);

      const result = await controller.create(userId, 'vid-1', dto as any);

      expect(service.create).toHaveBeenCalledWith(userId, 'vid-1', dto);
      expect(result).toEqual(expect.objectContaining({ id: 'clip-1' }));
    });
  });

  describe('getByVideo', () => {
    it('should call clipsService.getByVideo with videoId and parsed limit', async () => {
      const mockClips = { data: [{ id: 'clip-1' }], meta: { cursor: null, hasMore: false } };
      service.getByVideo.mockResolvedValue(mockClips as any);

      const result = await controller.getByVideo('vid-1', 'cursor-1', '10');

      expect(service.getByVideo).toHaveBeenCalledWith('vid-1', 'cursor-1', 10);
      expect(result).toEqual(mockClips);
    });
  });

  describe('getByUser', () => {
    it('should call clipsService.getByUser with userId', async () => {
      const mockClips = { data: [{ id: 'clip-1' }], meta: { cursor: null, hasMore: false } };
      service.getByUser.mockResolvedValue(mockClips as any);

      const result = await controller.getByUser(userId, undefined, undefined);

      expect(service.getByUser).toHaveBeenCalledWith(userId, undefined, undefined);
      expect(result).toEqual(mockClips);
    });
  });

  describe('delete', () => {
    it('should call clipsService.delete with id and userId', async () => {
      service.delete.mockResolvedValue({ deleted: true } as any);

      const result = await controller.delete(userId, 'clip-1');

      expect(service.delete).toHaveBeenCalledWith('clip-1', userId);
      expect(result).toEqual({ deleted: true });
    });

    it('should propagate ForbiddenException for non-owner', async () => {
      service.delete.mockRejectedValue(new ForbiddenException('Not the clip owner'));

      await expect(controller.delete('other-user', 'clip-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getShareLink', () => {
    it('should call clipsService.getShareLink with clip id', async () => {
      service.getShareLink.mockResolvedValue({ url: 'https://mizanly.com/clip/clip-1' } as any);

      const result = await controller.getShareLink('clip-1');

      expect(service.getShareLink).toHaveBeenCalledWith('clip-1');
      expect(result).toEqual(expect.objectContaining({ url: expect.any(String) }));
    });
  });
});

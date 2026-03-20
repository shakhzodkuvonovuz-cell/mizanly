import { Test, TestingModule } from '@nestjs/testing';
import { VideoRepliesController } from './video-replies.controller';
import { VideoRepliesService } from './video-replies.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('VideoRepliesController', () => {
  let controller: VideoRepliesController;
  let service: jest.Mocked<VideoRepliesService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideoRepliesController],
      providers: [
        ...globalMockProviders,
        {
          provide: VideoRepliesService,
          useValue: {
            create: jest.fn(),
            getByComment: jest.fn(),
            getById: jest.fn(),
            delete: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(VideoRepliesController);
    service = module.get(VideoRepliesService) as jest.Mocked<VideoRepliesService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should call videoRepliesService.create with userId and body', async () => {
      const body = { commentId: 'c-1', commentType: 'post' as const, mediaUrl: 'https://cdn.example.com/reply.mp4' };
      service.create.mockResolvedValue({ id: 'vr-1' } as any);

      await controller.create(userId, body as any);

      expect(service.create).toHaveBeenCalledWith(userId, body);
    });
  });

  describe('getByComment', () => {
    it('should call videoRepliesService.getByComment with commentId and cursor', async () => {
      service.getByComment.mockResolvedValue({ data: [] } as any);

      await controller.getByComment('c-1', 'cursor-1');

      expect(service.getByComment).toHaveBeenCalledWith('c-1', 'cursor-1');
    });
  });

  describe('getById', () => {
    it('should call videoRepliesService.getById with id', async () => {
      service.getById.mockResolvedValue({ id: 'vr-1', mediaUrl: 'https://cdn.example.com/reply.mp4' } as any);

      await controller.getById('vr-1');

      expect(service.getById).toHaveBeenCalledWith('vr-1');
    });
  });

  describe('delete', () => {
    it('should call videoRepliesService.delete with id and userId', async () => {
      service.delete.mockResolvedValue({ deleted: true } as any);

      await controller.delete('vr-1', userId);

      expect(service.delete).toHaveBeenCalledWith('vr-1', userId);
    });
  });
});

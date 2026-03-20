import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { PrismaService } from '../../config/prisma.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('VideosController', () => {
  let controller: VideosController;
  let service: VideosService;

  const mockService = {
    create: jest.fn(),
    getFeed: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    like: jest.fn(),
    dislike: jest.fn(),
    removeReaction: jest.fn(),
    comment: jest.fn(),
    getComments: jest.fn(),
    bookmark: jest.fn(),
    unbookmark: jest.fn(),
    view: jest.fn(),
    updateProgress: jest.fn(),
    report: jest.fn(),
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'CLERK_SECRET_KEY' ? 'test-secret' : null),
    };
    const mockPrismaService = {};

    const module = await Test.createTestingModule({
      controllers: [VideosController],
      providers: [
        ...globalMockProviders,
        { provide: VideosService, useValue: mockService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(VideosController);
    service = module.get(VideosService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(VideosController);
  });

  describe('create', () => {
    it('should call service.create with userId and dto', async () => {
      const dto = { title: 'Video' } as any;
      mockService.create.mockResolvedValue({ id: 'vid-1' });
      await controller.create('user-1', dto);
      expect(mockService.create).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('getFeed', () => {
    it('should call service.getFeed with userId, category, cursor', async () => {
      mockService.getFeed.mockResolvedValue({ data: [], meta: {} });
      await controller.getFeed('user-1', 'tech', 'cursor-123');
      expect(mockService.getFeed).toHaveBeenCalledWith('user-1', 'tech', 'cursor-123');
    });

    it('should call service.getFeed with undefined category and cursor', async () => {
      mockService.getFeed.mockResolvedValue({ data: [], meta: {} });
      await controller.getFeed('user-1', undefined, undefined);
      expect(mockService.getFeed).toHaveBeenCalledWith('user-1', undefined, undefined);
    });
  });

  describe('getById', () => {
    it('should call service.getById with id and userId', async () => {
      mockService.getById.mockResolvedValue({ id: 'vid-1' });
      await controller.getById('vid-1', 'user-1');
      expect(mockService.getById).toHaveBeenCalledWith('vid-1', 'user-1');
    });

    it('should call service.getById with undefined userId', async () => {
      mockService.getById.mockResolvedValue({ id: 'vid-1' });
      await controller.getById('vid-1', undefined);
      expect(mockService.getById).toHaveBeenCalledWith('vid-1', undefined);
    });
  });

  describe('update', () => {
    it('should call service.update with id, userId, dto', async () => {
      const dto = { title: 'Updated' } as any;
      mockService.update.mockResolvedValue({ id: 'vid-1' });
      await controller.update('vid-1', 'user-1', dto);
      expect(mockService.update).toHaveBeenCalledWith('vid-1', 'user-1', dto);
    });
  });

  describe('delete', () => {
    it('should call service.delete with id, userId', async () => {
      mockService.delete.mockResolvedValue({ deleted: true });
      await controller.delete('vid-1', 'user-1');
      expect(mockService.delete).toHaveBeenCalledWith('vid-1', 'user-1');
    });
  });

  describe('like', () => {
    it('should call service.like with id, userId', async () => {
      mockService.like.mockResolvedValue({ liked: true });
      await controller.like('vid-1', 'user-1');
      expect(mockService.like).toHaveBeenCalledWith('vid-1', 'user-1');
    });
  });

  describe('dislike', () => {
    it('should call service.dislike with id, userId', async () => {
      mockService.dislike.mockResolvedValue({ disliked: true });
      await controller.dislike('vid-1', 'user-1');
      expect(mockService.dislike).toHaveBeenCalledWith('vid-1', 'user-1');
    });
  });

  describe('removeReaction', () => {
    it('should call service.removeReaction with id, userId', async () => {
      mockService.removeReaction.mockResolvedValue({ removed: true });
      await controller.removeReaction('vid-1', 'user-1');
      expect(mockService.removeReaction).toHaveBeenCalledWith('vid-1', 'user-1');
    });
  });

  describe('comment', () => {
    it('should call service.comment with id, userId, content, parentId', async () => {
      const dto = { content: 'Great video', parentId: 'parent-1' } as any;
      mockService.comment.mockResolvedValue({ id: 'comment-1' });
      await controller.comment('vid-1', 'user-1', dto);
      expect(mockService.comment).toHaveBeenCalledWith('vid-1', 'user-1', 'Great video', 'parent-1');
    });
  });

  describe('getComments', () => {
    it('should call service.getComments with id, cursor', async () => {
      mockService.getComments.mockResolvedValue({ data: [], meta: {} });
      await controller.getComments('vid-1', 'cursor-123');
      expect(mockService.getComments).toHaveBeenCalledWith('vid-1', 'cursor-123');
    });
  });

  describe('bookmark', () => {
    it('should call service.bookmark with id, userId', async () => {
      mockService.bookmark.mockResolvedValue({ bookmarked: true });
      await controller.bookmark('vid-1', 'user-1');
      expect(mockService.bookmark).toHaveBeenCalledWith('vid-1', 'user-1');
    });
  });

  describe('unbookmark', () => {
    it('should call service.unbookmark with id, userId', async () => {
      mockService.unbookmark.mockResolvedValue({ unbookmarked: true });
      await controller.unbookmark('vid-1', 'user-1');
      expect(mockService.unbookmark).toHaveBeenCalledWith('vid-1', 'user-1');
    });
  });

  describe('view', () => {
    it('should call service.view with id, userId when authenticated', async () => {
      mockService.view.mockResolvedValue({ viewed: true });
      await controller.view('vid-1', 'user-1');
      expect(mockService.view).toHaveBeenCalledWith('vid-1', 'user-1');
    });

    it('should not call service.view when userId is undefined', async () => {
      mockService.view.mockResolvedValue({ viewed: true });
      const result = await controller.view('vid-1', undefined);
      expect(mockService.view).not.toHaveBeenCalled();
      expect(result).toEqual({ viewed: true });
    });
  });

  describe('updateProgress', () => {
    it('should call service.updateProgress with id, userId, progress', async () => {
      mockService.updateProgress.mockResolvedValue({ updated: true });
      await controller.updateProgress('vid-1', 'user-1', { progress: 120 });
      expect(mockService.updateProgress).toHaveBeenCalledWith('vid-1', 'user-1', 120);
    });
  });

  describe('report', () => {
    it('should call service.report with id, userId, reason', async () => {
      mockService.report.mockResolvedValue({ reported: true });
      await controller.report('vid-1', 'user-1', { reason: 'spam' });
      expect(mockService.report).toHaveBeenCalledWith('vid-1', 'user-1', 'spam');
    });
  });
});
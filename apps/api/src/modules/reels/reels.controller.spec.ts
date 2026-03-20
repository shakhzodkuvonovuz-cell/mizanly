import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReelsController } from './reels.controller';
import { ReelsService } from './reels.service';
import { PrismaService } from '../../config/prisma.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ReelsController', () => {
  let controller: ReelsController;
  let service: ReelsService;

  const mockService = {
    create: jest.fn(),
    getFeed: jest.fn(),
    getById: jest.fn(),
    delete: jest.fn(),
    like: jest.fn(),
    unlike: jest.fn(),
    comment: jest.fn(),
    getComments: jest.fn(),
    deleteComment: jest.fn(),
    share: jest.fn(),
    bookmark: jest.fn(),
    unbookmark: jest.fn(),
    view: jest.fn(),
    getUserReels: jest.fn(),
    report: jest.fn(),
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'CLERK_SECRET_KEY' ? 'test-secret' : null),
    };
    const mockPrismaService = {};

    const module = await Test.createTestingModule({
      controllers: [ReelsController],
      providers: [
        ...globalMockProviders,
        { provide: ReelsService, useValue: mockService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ReelsController);
    service = module.get(ReelsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(ReelsController);
  });

  describe('create', () => {
    it('should call service.create with userId and dto', async () => {
      const dto = { videoUrl: 'url' } as any;
      mockService.create.mockResolvedValue({ id: 'reel-1' });
      const result = await controller.create('user-1', dto);
      expect(mockService.create).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('getFeed', () => {
    it('should call service.getFeed with userId and cursor', async () => {
      mockService.getFeed.mockResolvedValue({ data: [] });
      await controller.getFeed('user-1', 'cursor-1');
      expect(mockService.getFeed).toHaveBeenCalledWith('user-1', 'cursor-1');
    });
  });

  describe('getById', () => {
    it('should call service.getById with id and userId', async () => {
      mockService.getById.mockResolvedValue({ id: 'reel-1' });
      const result = await controller.getById('reel-1', 'user-1');
      expect(mockService.getById).toHaveBeenCalledWith('reel-1', 'user-1');
      expect(result).toEqual({ id: 'reel-1' });
    });
  });

  describe('delete', () => {
    it('should call service.delete with id and userId', async () => {
      mockService.delete.mockResolvedValue({ deleted: true });
      await controller.delete('reel-1', 'user-1');
      expect(mockService.delete).toHaveBeenCalledWith('reel-1', 'user-1');
    });
  });

  describe('like', () => {
    it('should call service.like with id and userId', async () => {
      mockService.like.mockResolvedValue({ liked: true });
      await controller.like('reel-1', 'user-1');
      expect(mockService.like).toHaveBeenCalledWith('reel-1', 'user-1');
    });
  });

  describe('unlike', () => {
    it('should call service.unlike with id and userId', async () => {
      mockService.unlike.mockResolvedValue({ unliked: true });
      await controller.unlike('reel-1', 'user-1');
      expect(mockService.unlike).toHaveBeenCalledWith('reel-1', 'user-1');
    });
  });

  describe('comment', () => {
    it('should call service.comment with id, userId, and content', async () => {
      const dto = { content: 'comment' } as any;
      mockService.comment.mockResolvedValue({ id: 'comment-1' });
      await controller.comment('reel-1', 'user-1', dto);
      expect(mockService.comment).toHaveBeenCalledWith('reel-1', 'user-1', 'comment');
    });
  });

  describe('getComments', () => {
    it('should call service.getComments with id, userId, and cursor', async () => {
      mockService.getComments.mockResolvedValue({ data: [] });
      await controller.getComments('reel-1', 'user-1', 'cursor-1');
      expect(mockService.getComments).toHaveBeenCalledWith('reel-1', 'user-1', 'cursor-1');
    });
  });

  describe('deleteComment', () => {
    it('should call service.deleteComment with id, commentId, and userId', async () => {
      mockService.deleteComment.mockResolvedValue({ deleted: true });
      await controller.deleteComment('reel-1', 'comment-1', 'user-1');
      expect(mockService.deleteComment).toHaveBeenCalledWith('reel-1', 'comment-1', 'user-1');
    });
  });

  describe('share', () => {
    it('should call service.share with id and userId', async () => {
      mockService.share.mockResolvedValue({ shared: true });
      await controller.share('reel-1', 'user-1');
      expect(mockService.share).toHaveBeenCalledWith('reel-1', 'user-1');
    });
  });

  describe('bookmark', () => {
    it('should call service.bookmark with id and userId', async () => {
      mockService.bookmark.mockResolvedValue({ bookmarked: true });
      await controller.bookmark('reel-1', 'user-1');
      expect(mockService.bookmark).toHaveBeenCalledWith('reel-1', 'user-1');
    });
  });

  describe('unbookmark', () => {
    it('should call service.unbookmark with id and userId', async () => {
      mockService.unbookmark.mockResolvedValue({ unbookmarked: true });
      await controller.unbookmark('reel-1', 'user-1');
      expect(mockService.unbookmark).toHaveBeenCalledWith('reel-1', 'user-1');
    });
  });

  describe('view', () => {
    it('should call service.view with id and userId when authenticated', async () => {
      mockService.view.mockResolvedValue({ viewed: true });
      await controller.view('reel-1', 'user-1');
      expect(mockService.view).toHaveBeenCalledWith('reel-1', 'user-1');
    });

    it('should return { viewed: true } without calling service.view when not authenticated', async () => {
      const result = await controller.view('reel-1', undefined);
      expect(mockService.view).not.toHaveBeenCalled();
      expect(result).toEqual({ viewed: true });
    });
  });

  describe('getUserReels', () => {
    it('should call service.getUserReels with username, cursor, limit, and userId', async () => {
      mockService.getUserReels.mockResolvedValue({ data: [] });
      await controller.getUserReels('username', 'user-1', 'cursor-1');
      expect(mockService.getUserReels).toHaveBeenCalledWith('username', 'cursor-1', 20, 'user-1');
    });
  });

  describe('report', () => {
    it('should call service.report with id, userId, and reason', async () => {
      mockService.report.mockResolvedValue({ reported: true });
      await controller.report('reel-1', 'user-1', { reason: 'spam' });
      expect(mockService.report).toHaveBeenCalledWith('reel-1', 'user-1', 'spam');
    });
  });
});
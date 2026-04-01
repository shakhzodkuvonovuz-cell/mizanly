import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PrismaService } from '../../config/prisma.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PostsController', () => {
  let controller: PostsController;
  let service: PostsService;

  const mockService = {
    getFeed: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
    recordView: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    react: jest.fn(),
    unreact: jest.fn(),
    save: jest.fn(),
    unsave: jest.fn(),
    share: jest.fn(),
    getComments: jest.fn(),
    addComment: jest.fn(),
    getCommentReplies: jest.fn(),
    editComment: jest.fn(),
    deleteComment: jest.fn(),
    likeComment: jest.fn(),
    unlikeComment: jest.fn(),
    report: jest.fn(),
    dismiss: jest.fn(),
    shareAsStory: jest.fn(),
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'CLERK_SECRET_KEY' ? 'test-secret' : null),
    };
    const mockPrismaService = {};

    const module = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [
        ...globalMockProviders,
        { provide: PostsService, useValue: mockService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(PostsController);
    service = module.get(PostsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getFeed', () => {
    it('should call service.getFeed with userId and type', async () => {
      mockService.getFeed.mockResolvedValue({ data: [], meta: {} });
      await controller.getFeed('user-1', 'foryou', undefined);
      expect(mockService.getFeed).toHaveBeenCalledWith('user-1', 'foryou', undefined);
    });
  });

  describe('create', () => {
    it('should call service.create with userId and dto', async () => {
      const dto = { content: 'test' } as any;
      mockService.create.mockResolvedValue({ id: 'post-1' });
      const result = await controller.create('user-1', dto);
      expect(mockService.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual({ id: 'post-1' });
    });
  });

  describe('getById', () => {
    it('should call service.getById with id and viewerId', async () => {
      mockService.getById.mockResolvedValue({ id: 'post-1' });
      const result = await controller.getById('post-1', 'viewer-1');
      expect(mockService.getById).toHaveBeenCalledWith('post-1', 'viewer-1');
      expect(result).toEqual({ id: 'post-1' });
    });
  });

  describe('update', () => {
    it('should call service.update with id, userId, and dto', async () => {
      const dto = { content: 'updated' } as any;
      mockService.update.mockResolvedValue({ id: 'post-1' });
      await controller.update('post-1', 'user-1', dto);
      expect(mockService.update).toHaveBeenCalledWith('post-1', 'user-1', dto);
    });
  });

  describe('delete', () => {
    it('should call service.delete with id and userId', async () => {
      mockService.delete.mockResolvedValue({ deleted: true });
      await controller.delete('post-1', 'user-1');
      expect(mockService.delete).toHaveBeenCalledWith('post-1', 'user-1');
    });
  });

  describe('react', () => {
    it('should call service.react with id, userId, and reaction', async () => {
      const dto = { reaction: 'LIKE' } as any;
      mockService.react.mockResolvedValue({ reacted: true });
      await controller.react('post-1', 'user-1', dto);
      expect(mockService.react).toHaveBeenCalledWith('post-1', 'user-1', 'LIKE');
    });
  });

  describe('unreact', () => {
    it('should call service.unreact with id and userId', async () => {
      mockService.unreact.mockResolvedValue({ unreacted: true });
      await controller.unreact('post-1', 'user-1');
      expect(mockService.unreact).toHaveBeenCalledWith('post-1', 'user-1');
    });
  });

  describe('save', () => {
    it('should call service.save with id and userId', async () => {
      mockService.save.mockResolvedValue({ saved: true });
      await controller.save('post-1', 'user-1');
      expect(mockService.save).toHaveBeenCalledWith('post-1', 'user-1');
    });
  });

  describe('unsave', () => {
    it('should call service.unsave with id and userId', async () => {
      mockService.unsave.mockResolvedValue({ unsaved: true });
      await controller.unsave('post-1', 'user-1');
      expect(mockService.unsave).toHaveBeenCalledWith('post-1', 'user-1');
    });
  });

  describe('share', () => {
    it('should call service.share with id, userId, and content', async () => {
      const dto = { content: 'sharing' } as any;
      mockService.share.mockResolvedValue({ shared: true });
      await controller.share('post-1', 'user-1', dto);
      expect(mockService.share).toHaveBeenCalledWith('post-1', 'user-1', 'sharing');
    });
  });

  describe('getComments', () => {
    it('should call service.getComments with id and cursor', async () => {
      mockService.getComments.mockResolvedValue({ data: [] });
      await controller.getComments('post-1', 'cursor-1');
      expect(mockService.getComments).toHaveBeenCalledWith('post-1', 'cursor-1', undefined, undefined);
    });
  });

  describe('addComment', () => {
    it('should call service.addComment with id, userId, and dto', async () => {
      const dto = { content: 'comment' } as any;
      mockService.addComment.mockResolvedValue({ id: 'comment-1' });
      await controller.addComment('post-1', 'user-1', dto);
      expect(mockService.addComment).toHaveBeenCalledWith('post-1', 'user-1', dto);
    });
  });

  describe('getCommentReplies', () => {
    it('should call service.getCommentReplies with commentId and cursor', async () => {
      mockService.getCommentReplies.mockResolvedValue({ data: [] });
      await controller.getCommentReplies('comment-1', 'cursor-1');
      expect(mockService.getCommentReplies).toHaveBeenCalledWith('comment-1', 'cursor-1');
    });
  });

  describe('editComment', () => {
    it('should call service.editComment with commentId, userId, and content', async () => {
      const dto = { content: 'edited' } as any;
      mockService.editComment.mockResolvedValue({ edited: true });
      await controller.editComment('comment-1', 'user-1', dto);
      expect(mockService.editComment).toHaveBeenCalledWith('comment-1', 'user-1', 'edited');
    });
  });

  describe('deleteComment', () => {
    it('should call service.deleteComment with commentId and userId', async () => {
      mockService.deleteComment.mockResolvedValue({ deleted: true });
      await controller.deleteComment('comment-1', 'user-1');
      expect(mockService.deleteComment).toHaveBeenCalledWith('comment-1', 'user-1');
    });
  });

  describe('likeComment', () => {
    it('should call service.likeComment with commentId and userId', async () => {
      mockService.likeComment.mockResolvedValue({ liked: true });
      await controller.likeComment('comment-1', 'user-1');
      expect(mockService.likeComment).toHaveBeenCalledWith('comment-1', 'user-1');
    });
  });

  describe('unlikeComment', () => {
    it('should call service.unlikeComment with commentId and userId', async () => {
      mockService.unlikeComment.mockResolvedValue({ unliked: true });
      await controller.unlikeComment('comment-1', 'user-1');
      expect(mockService.unlikeComment).toHaveBeenCalledWith('comment-1', 'user-1');
    });
  });

  describe('report', () => {
    it('should call service.report with id, userId, and reason', async () => {
      mockService.report.mockResolvedValue({ reported: true });
      await controller.report('post-1', 'user-1', { reason: 'spam' });
      expect(mockService.report).toHaveBeenCalledWith('post-1', 'user-1', 'spam');
    });
  });

  describe('dismiss', () => {
    it('should call service.dismiss with id and userId', async () => {
      mockService.dismiss.mockResolvedValue({ dismissed: true });
      await controller.dismiss('post-1', 'user-1');
      expect(mockService.dismiss).toHaveBeenCalledWith('post-1', 'user-1');
    });
  });

  describe('shareAsStory', () => {
    it('should call service.shareAsStory with postId and userId', async () => {
      const mockStory = { id: 'story-1', mediaUrl: 'https://cdn.example.com/img.jpg', mediaType: 'image' };
      mockService.shareAsStory.mockResolvedValue(mockStory);
      const result = await controller.shareAsStory('post-1', 'user-1');
      expect(mockService.shareAsStory).toHaveBeenCalledWith('post-1', 'user-1');
      expect(result).toEqual(mockStory);
    });
  });
});
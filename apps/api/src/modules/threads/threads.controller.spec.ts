import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';
import { PrismaService } from '../../config/prisma.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ThreadsController', () => {
  let controller: ThreadsController;
  let service: ThreadsService;

  const mockService = {
    getFeed: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
    delete: jest.fn(),
    like: jest.fn(),
    unlike: jest.fn(),
    repost: jest.fn(),
    unrepost: jest.fn(),
    bookmark: jest.fn(),
    unbookmark: jest.fn(),
    getReplies: jest.fn(),
    likeReply: jest.fn(),
    unlikeReply: jest.fn(),
    addReply: jest.fn(),
    deleteReply: jest.fn(),
    votePoll: jest.fn(),
    getUserThreads: jest.fn(),
    report: jest.fn(),
    dismiss: jest.fn(),
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'CLERK_SECRET_KEY' ? 'test-secret' : null),
    };
    const mockPrismaService = {};

    const module = await Test.createTestingModule({
      controllers: [ThreadsController],
      providers: [
        ...globalMockProviders,
        { provide: ThreadsService, useValue: mockService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ThreadsController);
    service = module.get(ThreadsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getFeed', () => {
    it('should call service.getFeed with userId, type, and cursor', async () => {
      mockService.getFeed.mockResolvedValue({ data: [] });
      await controller.getFeed('user-1', 'foryou', undefined);
      expect(mockService.getFeed).toHaveBeenCalledWith('user-1', 'foryou', undefined);
    });
  });

  describe('create', () => {
    it('should call service.create with userId and dto', async () => {
      const dto = { content: 'thread' } as any;
      mockService.create.mockResolvedValue({ id: 'thread-1' });
      const result = await controller.create('user-1', dto);
      expect(mockService.create).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual({ id: 'thread-1' });
    });
  });

  describe('getById', () => {
    it('should call service.getById with id and viewerId', async () => {
      mockService.getById.mockResolvedValue({ id: 'thread-1' });
      const result = await controller.getById('thread-1', 'viewer-1');
      expect(mockService.getById).toHaveBeenCalledWith('thread-1', 'viewer-1');
      expect(result).toEqual({ id: 'thread-1' });
    });
  });

  describe('delete', () => {
    it('should call service.delete with id and userId', async () => {
      mockService.delete.mockResolvedValue({ deleted: true });
      await controller.delete('thread-1', 'user-1');
      expect(mockService.delete).toHaveBeenCalledWith('thread-1', 'user-1');
    });
  });

  describe('like', () => {
    it('should call service.like with id and userId', async () => {
      mockService.like.mockResolvedValue({ liked: true });
      await controller.like('thread-1', 'user-1');
      expect(mockService.like).toHaveBeenCalledWith('thread-1', 'user-1');
    });
  });

  describe('unlike', () => {
    it('should call service.unlike with id and userId', async () => {
      mockService.unlike.mockResolvedValue({ unliked: true });
      await controller.unlike('thread-1', 'user-1');
      expect(mockService.unlike).toHaveBeenCalledWith('thread-1', 'user-1');
    });
  });

  describe('repost', () => {
    it('should call service.repost with id and userId', async () => {
      mockService.repost.mockResolvedValue({ reposted: true });
      await controller.repost('thread-1', 'user-1');
      expect(mockService.repost).toHaveBeenCalledWith('thread-1', 'user-1');
    });
  });

  describe('unrepost', () => {
    it('should call service.unrepost with id and userId', async () => {
      mockService.unrepost.mockResolvedValue({ unreposted: true });
      await controller.unrepost('thread-1', 'user-1');
      expect(mockService.unrepost).toHaveBeenCalledWith('thread-1', 'user-1');
    });
  });

  describe('bookmark', () => {
    it('should call service.bookmark with id and userId', async () => {
      mockService.bookmark.mockResolvedValue({ bookmarked: true });
      await controller.bookmark('thread-1', 'user-1');
      expect(mockService.bookmark).toHaveBeenCalledWith('thread-1', 'user-1');
    });
  });

  describe('unbookmark', () => {
    it('should call service.unbookmark with id and userId', async () => {
      mockService.unbookmark.mockResolvedValue({ unbookmarked: true });
      await controller.unbookmark('thread-1', 'user-1');
      expect(mockService.unbookmark).toHaveBeenCalledWith('thread-1', 'user-1');
    });
  });

  describe('getReplies', () => {
    it('should call service.getReplies with id, cursor, limit, and viewerId', async () => {
      mockService.getReplies.mockResolvedValue({ data: [] });
      await controller.getReplies('thread-1', 'cursor-1', 'viewer-1');
      expect(mockService.getReplies).toHaveBeenCalledWith('thread-1', 'cursor-1', 20, 'viewer-1');
    });
  });

  describe('likeReply', () => {
    it('should call service.likeReply with threadId, replyId, and userId', async () => {
      mockService.likeReply.mockResolvedValue({ liked: true });
      await controller.likeReply('thread-1', 'reply-1', 'user-1');
      expect(mockService.likeReply).toHaveBeenCalledWith('thread-1', 'reply-1', 'user-1');
    });
  });

  describe('unlikeReply', () => {
    it('should call service.unlikeReply with threadId, replyId, and userId', async () => {
      mockService.unlikeReply.mockResolvedValue({ unliked: true });
      await controller.unlikeReply('thread-1', 'reply-1', 'user-1');
      expect(mockService.unlikeReply).toHaveBeenCalledWith('thread-1', 'reply-1', 'user-1');
    });
  });

  describe('addReply', () => {
    it('should call service.addReply with id, userId, content, and parentId', async () => {
      const dto = { content: 'reply', parentId: 'parent-1' } as any;
      mockService.addReply.mockResolvedValue({ id: 'reply-1' });
      await controller.addReply('thread-1', 'user-1', dto);
      expect(mockService.addReply).toHaveBeenCalledWith('thread-1', 'user-1', 'reply', 'parent-1');
    });
  });

  describe('deleteReply', () => {
    it('should call service.deleteReply with replyId and userId', async () => {
      mockService.deleteReply.mockResolvedValue({ deleted: true });
      await controller.deleteReply('reply-1', 'user-1');
      expect(mockService.deleteReply).toHaveBeenCalledWith('reply-1', 'user-1');
    });
  });

  describe('votePoll', () => {
    it('should call service.votePoll with optionId and userId', async () => {
      mockService.votePoll.mockResolvedValue({ voted: true });
      await controller.votePoll('option-1', 'user-1');
      expect(mockService.votePoll).toHaveBeenCalledWith('option-1', 'user-1');
    });
  });

  describe('getUserThreads', () => {
    it('should call service.getUserThreads with username and cursor', async () => {
      mockService.getUserThreads.mockResolvedValue({ data: [] });
      await controller.getUserThreads('username', 'cursor-1');
      expect(mockService.getUserThreads).toHaveBeenCalledWith('username', 'cursor-1', 20, undefined);
    });
  });

  describe('report', () => {
    it('should call service.report with id, userId, and reason', async () => {
      mockService.report.mockResolvedValue({ reported: true });
      await controller.report('thread-1', 'user-1', { reason: 'spam' });
      expect(mockService.report).toHaveBeenCalledWith('thread-1', 'user-1', 'spam');
    });
  });

  describe('dismiss', () => {
    it('should call service.dismiss with id and userId', async () => {
      mockService.dismiss.mockResolvedValue({ dismissed: true });
      await controller.dismiss('thread-1', 'user-1');
      expect(mockService.dismiss).toHaveBeenCalledWith('thread-1', 'user-1');
    });
  });
});
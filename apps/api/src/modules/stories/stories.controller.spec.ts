import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { PrismaService } from '../../config/prisma.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StoriesController', () => {
  let controller: StoriesController;
  let service: StoriesService;

  const mockService = {
    getFeedStories: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
    delete: jest.fn(),
    markViewed: jest.fn(),
    getViewers: jest.fn(),
    getHighlights: jest.fn(),
    createHighlight: jest.fn(),
    updateHighlight: jest.fn(),
    deleteHighlight: jest.fn(),
    getArchived: jest.fn(),
    addStoryToHighlight: jest.fn(),
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'CLERK_SECRET_KEY' ? 'test-secret' : null),
    };
    const mockPrismaService = {};

    const module = await Test.createTestingModule({
      controllers: [StoriesController],
      providers: [
        ...globalMockProviders,
        { provide: StoriesService, useValue: mockService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(StoriesController);
    service = module.get(StoriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getFeed', () => {
    it('should call service.getFeedStories with userId', async () => {
      mockService.getFeedStories.mockResolvedValue([]);
      await controller.getFeed('user-1');
      expect(mockService.getFeedStories).toHaveBeenCalledWith('user-1');
    });
  });

  describe('create', () => {
    it('should call service.create with userId and dto', async () => {
      const dto = { mediaUrl: 'url', mediaType: 'IMAGE' };
      mockService.create.mockResolvedValue({ id: 'story-1' });
      await controller.create('user-1', dto);
      expect(mockService.create).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('getById', () => {
    it('should call service.getById with id', async () => {
      mockService.getById.mockResolvedValue({ id: 'story-1' });
      await controller.getById('story-1');
      expect(mockService.getById).toHaveBeenCalledWith('story-1');
    });
  });

  describe('delete', () => {
    it('should call service.delete with id, userId', async () => {
      mockService.delete.mockResolvedValue({ deleted: true });
      await controller.delete('story-1', 'user-1');
      expect(mockService.delete).toHaveBeenCalledWith('story-1', 'user-1');
    });
  });

  describe('markViewed', () => {
    it('should call service.markViewed with id, userId', async () => {
      mockService.markViewed.mockResolvedValue({ viewed: true });
      await controller.markViewed('story-1', 'user-1');
      expect(mockService.markViewed).toHaveBeenCalledWith('story-1', 'user-1');
    });
  });

  describe('getViewers', () => {
    it('should call service.getViewers with id, userId, cursor', async () => {
      mockService.getViewers.mockResolvedValue({ data: [], meta: {} });
      await controller.getViewers('story-1', 'user-1', 'cursor-123');
      expect(mockService.getViewers).toHaveBeenCalledWith('story-1', 'user-1', 'cursor-123');
    });
  });

  describe('getHighlights', () => {
    it('should call service.getHighlights with userId', async () => {
      mockService.getHighlights.mockResolvedValue([]);
      await controller.getHighlights('user-1');
      expect(mockService.getHighlights).toHaveBeenCalledWith('user-1');
    });
  });

  describe('createHighlight', () => {
    it('should call service.createHighlight with userId, title, coverUrl', async () => {
      const dto = { title: 'Highlights', coverUrl: 'url' };
      mockService.createHighlight.mockResolvedValue({ id: 'hl-1' });
      await controller.createHighlight('user-1', dto);
      expect(mockService.createHighlight).toHaveBeenCalledWith('user-1', 'Highlights', 'url');
    });
  });

  describe('updateHighlight', () => {
    it('should call service.updateHighlight with albumId, userId, dto', async () => {
      const dto = { title: 'Updated' };
      mockService.updateHighlight.mockResolvedValue({ id: 'hl-1' });
      await controller.updateHighlight('hl-1', 'user-1', dto);
      expect(mockService.updateHighlight).toHaveBeenCalledWith('hl-1', 'user-1', dto);
    });
  });

  describe('deleteHighlight', () => {
    it('should call service.deleteHighlight with albumId, userId', async () => {
      mockService.deleteHighlight.mockResolvedValue({ deleted: true });
      await controller.deleteHighlight('hl-1', 'user-1');
      expect(mockService.deleteHighlight).toHaveBeenCalledWith('hl-1', 'user-1');
    });
  });

  describe('getArchived', () => {
    it('should call service.getArchived with userId', async () => {
      mockService.getArchived.mockResolvedValue([]);
      await controller.getArchived('user-1');
      expect(mockService.getArchived).toHaveBeenCalledWith('user-1');
    });
  });

  describe('addToHighlight', () => {
    it('should call service.addStoryToHighlight with albumId, storyId, userId', async () => {
      mockService.addStoryToHighlight.mockResolvedValue({ added: true });
      await controller.addToHighlight('hl-1', 'story-1', 'user-1');
      expect(mockService.addStoryToHighlight).toHaveBeenCalledWith('story-1', 'hl-1', 'user-1');
    });
  });
});
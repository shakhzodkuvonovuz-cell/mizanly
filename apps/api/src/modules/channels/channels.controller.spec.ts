import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { PrismaService } from '../../config/prisma.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('ChannelsController', () => {
  let controller: ChannelsController;
  let service: ChannelsService;

  const mockService = {
    create: jest.fn(),
    getByHandle: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    getVideos: jest.fn(),
    getMyChannels: jest.fn(),
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'CLERK_SECRET_KEY' ? 'test-secret' : null),
    };
    const mockPrismaService = {};

    const module = await Test.createTestingModule({
      controllers: [ChannelsController],
      providers: [
        ...globalMockProviders,
        { provide: ChannelsService, useValue: mockService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(ChannelsController);
    service = module.get(ChannelsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(ChannelsController);
  });

  describe('create', () => {
    it('should call service.create with userId and dto', async () => {
      const dto = { handle: 'test', name: 'Test Channel' };
      mockService.create.mockResolvedValue({ id: 'ch-1' });
      await controller.create('user-1', dto);
      expect(mockService.create).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('getByHandle', () => {
    it('should call service.getByHandle with handle and userId', async () => {
      mockService.getByHandle.mockResolvedValue({ id: 'ch-1' });
      await controller.getByHandle('test-handle', 'user-1');
      expect(mockService.getByHandle).toHaveBeenCalledWith('test-handle', 'user-1');
    });

    it('should call service.getByHandle with undefined userId', async () => {
      mockService.getByHandle.mockResolvedValue({ id: 'ch-1' });
      await controller.getByHandle('test-handle', undefined);
      expect(mockService.getByHandle).toHaveBeenCalledWith('test-handle', undefined);
    });
  });

  describe('update', () => {
    it('should call service.update with handle, userId, dto', async () => {
      const dto = { name: 'Updated' };
      mockService.update.mockResolvedValue({ id: 'ch-1' });
      await controller.update('test-handle', 'user-1', dto);
      expect(mockService.update).toHaveBeenCalledWith('test-handle', 'user-1', dto);
    });
  });

  describe('delete', () => {
    it('should call service.delete with handle, userId', async () => {
      mockService.delete.mockResolvedValue({ deleted: true });
      await controller.delete('test-handle', 'user-1');
      expect(mockService.delete).toHaveBeenCalledWith('test-handle', 'user-1');
    });
  });

  describe('subscribe', () => {
    it('should call service.subscribe with handle, userId', async () => {
      mockService.subscribe.mockResolvedValue({ subscribed: true });
      await controller.subscribe('test-handle', 'user-1');
      expect(mockService.subscribe).toHaveBeenCalledWith('test-handle', 'user-1');
    });
  });

  describe('unsubscribe', () => {
    it('should call service.unsubscribe with handle, userId', async () => {
      mockService.unsubscribe.mockResolvedValue({ unsubscribed: true });
      await controller.unsubscribe('test-handle', 'user-1');
      expect(mockService.unsubscribe).toHaveBeenCalledWith('test-handle', 'user-1');
    });
  });

  describe('getVideos', () => {
    it('should call service.getVideos with handle, userId, cursor', async () => {
      mockService.getVideos.mockResolvedValue({ data: [], meta: {} });
      await controller.getVideos('test-handle', 'user-1', 'cursor-123');
      expect(mockService.getVideos).toHaveBeenCalledWith('test-handle', 'user-1', 'cursor-123');
    });

    it('should call service.getVideos with undefined cursor', async () => {
      mockService.getVideos.mockResolvedValue({ data: [], meta: {} });
      await controller.getVideos('test-handle', 'user-1', undefined);
      expect(mockService.getVideos).toHaveBeenCalledWith('test-handle', 'user-1', undefined);
    });
  });

  describe('getMyChannels', () => {
    it('should call service.getMyChannels with userId', async () => {
      mockService.getMyChannels.mockResolvedValue([]);
      await controller.getMyChannels('user-1');
      expect(mockService.getMyChannels).toHaveBeenCalledWith('user-1');
    });
  });
});
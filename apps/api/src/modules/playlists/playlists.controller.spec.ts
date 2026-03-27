import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PlaylistsController } from './playlists.controller';
import { PlaylistsService } from './playlists.service';
import { PrismaService } from '../../config/prisma.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('PlaylistsController', () => {
  let controller: PlaylistsController;
  let service: PlaylistsService;

  const mockService = {
    create: jest.fn(),
    getById: jest.fn(),
    getByChannel: jest.fn(),
    getItems: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    addItem: jest.fn(),
    removeItem: jest.fn(),
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'CLERK_SECRET_KEY' ? 'test-secret' : null),
    };
    const mockPrismaService = {};

    const module = await Test.createTestingModule({
      controllers: [PlaylistsController],
      providers: [
        ...globalMockProviders,
        { provide: PlaylistsService, useValue: mockService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(PlaylistsController);
    service = module.get(PlaylistsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should call service.create', async () => {
      const dto = { channelId: 'ch1', title: 'Test' } as any;
      mockService.create.mockResolvedValue({ id: 'p1' });
      const result = await controller.create('u1', dto);
      expect(mockService.create).toHaveBeenCalledWith('u1', dto);
      expect(result).toEqual({ id: 'p1' });
    });
  });

  describe('getByChannel', () => {
    it('should call service.getByChannel', async () => {
      mockService.getByChannel.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } });
      await controller.getByChannel('ch1', undefined);
      expect(mockService.getByChannel).toHaveBeenCalledWith('ch1', undefined);
    });
  });

  describe('getById', () => {
    it('should call service.getById', async () => {
      mockService.getById.mockResolvedValue({ id: 'p1', title: 'Test' });
      const result = await controller.getById('p1');
      expect(mockService.getById).toHaveBeenCalledWith('p1');
      expect(result.title).toBe('Test');
    });
  });

  describe('getItems', () => {
    it('should call service.getItems', async () => {
      mockService.getItems.mockResolvedValue({ data: [], meta: { cursor: null, hasMore: false } });
      await controller.getItems('p1');
      expect(mockService.getItems).toHaveBeenCalledWith('p1', undefined);
    });
  });

  describe('update', () => {
    it('should call service.update', async () => {
      const dto = { title: 'Updated' } as any;
      mockService.update.mockResolvedValue({ id: 'p1', title: 'Updated' });
      await controller.update('p1', 'u1', dto);
      expect(mockService.update).toHaveBeenCalledWith('p1', 'u1', dto);
    });
  });

  describe('delete', () => {
    it('should call service.delete', async () => {
      mockService.delete.mockResolvedValue({ deleted: true });
      await controller.delete('p1', 'u1');
      expect(mockService.delete).toHaveBeenCalledWith('p1', 'u1');
    });
  });

  describe('addItem', () => {
    it('should call service.addItem', async () => {
      mockService.addItem.mockResolvedValue({ added: true });
      await controller.addItem('p1', 'v1', 'u1');
      expect(mockService.addItem).toHaveBeenCalledWith('p1', 'v1', 'u1');
    });
  });

  describe('removeItem', () => {
    it('should call service.removeItem', async () => {
      mockService.removeItem.mockResolvedValue({ removed: true });
      await controller.removeItem('p1', 'v1', 'u1');
      expect(mockService.removeItem).toHaveBeenCalledWith('p1', 'v1', 'u1');
    });
  });
});
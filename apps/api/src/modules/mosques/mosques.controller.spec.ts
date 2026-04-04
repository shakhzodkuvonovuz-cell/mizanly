import { Test, TestingModule } from '@nestjs/testing';
import { MosquesController } from './mosques.controller';
import { MosquesService } from './mosques.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MosquesController', () => {
  let controller: MosquesController;
  let service: jest.Mocked<MosquesService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MosquesController],
      providers: [
        ...globalMockProviders,
        {
          provide: MosquesService,
          useValue: {
            findNearby: jest.fn(),
            create: jest.fn(),
            getById: jest.fn(),
            join: jest.fn(),
            leave: jest.fn(),
            getFeed: jest.fn(),
            createPost: jest.fn(),
            getMembers: jest.fn(),
            getMyMosques: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(MosquesController);
    service = module.get(MosquesService) as jest.Mocked<MosquesService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('findNearby', () => {
    it('should call mosquesService.findNearby with parsed lat/lng and default radius 15', async () => {
      service.findNearby.mockResolvedValue([{ id: 'm-1', name: 'Al-Masjid' }] as any);

      await controller.findNearby('24.7', '46.6');

      expect(service.findNearby).toHaveBeenCalledWith(24.7, 46.6, 15);
    });

    it('should pass custom radius when provided', async () => {
      service.findNearby.mockResolvedValue([] as any);

      await controller.findNearby('24.7', '46.6', '5');

      expect(service.findNearby).toHaveBeenCalledWith(24.7, 46.6, 5);
    });

    it('should throw BadRequestException for invalid latitude', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      await expect(controller.findNearby('999', '46.6')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for NaN coords', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      await expect(controller.findNearby('abc', '46.6')).rejects.toThrow(BadRequestException);
    });

    it('should clamp radius to max 100', async () => {
      service.findNearby.mockResolvedValue([] as any);
      await controller.findNearby('24.7', '46.6', '200');
      expect(service.findNearby).toHaveBeenCalledWith(24.7, 46.6, 100);
    });
  });

  describe('create', () => {
    it('should call mosquesService.create with userId and dto', async () => {
      const dto = { name: 'Al-Masjid', address: '123 Main', city: 'Sydney', country: 'AU', latitude: -33.8, longitude: 151.2 };
      service.create.mockResolvedValue({ id: 'm-1', ...dto } as any);

      const result = await controller.create(userId, dto as any);

      expect(service.create).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'm-1' }));
    });
  });

  describe('getById', () => {
    it('should call mosquesService.getById with id', async () => {
      service.getById.mockResolvedValue({ id: 'm-1', name: 'Al-Masjid' } as any);

      const result = await controller.getById('m-1');

      expect(service.getById).toHaveBeenCalledWith('m-1');
      expect(result).toEqual(expect.objectContaining({ name: 'Al-Masjid' }));
    });
  });

  describe('join', () => {
    it('should call mosquesService.join with userId and mosqueId', async () => {
      service.join.mockResolvedValue({ joined: true } as any);

      await controller.join(userId, 'm-1');

      expect(service.join).toHaveBeenCalledWith(userId, 'm-1');
    });
  });

  describe('leave', () => {
    it('should call mosquesService.leave with userId and mosqueId', async () => {
      service.leave.mockResolvedValue({ left: true } as any);

      await controller.leave(userId, 'm-1');

      expect(service.leave).toHaveBeenCalledWith(userId, 'm-1');
    });
  });

  describe('getFeed', () => {
    it('should call mosquesService.getFeed with mosqueId and cursor', async () => {
      service.getFeed.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);

      await controller.getFeed('m-1', 'cursor-1');

      expect(service.getFeed).toHaveBeenCalledWith('m-1', 'cursor-1');
    });
  });

  describe('createPost', () => {
    it('should call mosquesService.createPost with userId, mosqueId, content, and mediaUrls', async () => {
      service.createPost.mockResolvedValue({ id: 'post-1' } as any);

      await controller.createPost(userId, 'm-1', { content: 'Jummah reminder', mediaUrls: ['img.jpg'] } as any);

      expect(service.createPost).toHaveBeenCalledWith(userId, 'm-1', 'Jummah reminder', ['img.jpg']);
    });
  });

  describe('getMembers', () => {
    it('should call mosquesService.getMembers with mosqueId and cursor', async () => {
      service.getMembers.mockResolvedValue({ data: [] } as any);

      await controller.getMembers('m-1', 'cursor-1');

      expect(service.getMembers).toHaveBeenCalledWith('m-1', 'cursor-1');
    });
  });

  describe('getMyMosques', () => {
    it('should call mosquesService.getMyMosques with userId', async () => {
      service.getMyMosques.mockResolvedValue([{ id: 'm-1' }] as any);

      const result = await controller.getMyMosques(userId);

      expect(service.getMyMosques).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
    });
  });
});

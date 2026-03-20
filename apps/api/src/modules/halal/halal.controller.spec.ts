import { Test, TestingModule } from '@nestjs/testing';
import { HalalController } from './halal.controller';
import { HalalService } from './halal.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('HalalController', () => {
  let controller: HalalController;
  let service: jest.Mocked<HalalService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HalalController],
      providers: [
        ...globalMockProviders,
        {
          provide: HalalService,
          useValue: {
            findNearby: jest.fn(),
            getById: jest.fn(),
            create: jest.fn(),
            addReview: jest.fn(),
            getReviews: jest.fn(),
            verifyHalal: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(HalalController);
    service = module.get(HalalService) as jest.Mocked<HalalService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('findNearby', () => {
    it('should call halalService.findNearby with parsed lat/lng and default radius', async () => {
      service.findNearby.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);

      await controller.findNearby('24.7136', '46.6753');

      expect(service.findNearby).toHaveBeenCalledWith(24.7136, 46.6753, 10, {
        cuisine: undefined,
        priceRange: undefined,
        certified: false,
      }, undefined);
    });

    it('should pass optional filters and cursor', async () => {
      service.findNearby.mockResolvedValue({ data: [{ id: 'r-1' }], meta: { hasMore: true } } as any);

      await controller.findNearby('24.7', '46.6', '5', 'turkish', '2', 'true', 'cursor-1');

      expect(service.findNearby).toHaveBeenCalledWith(24.7, 46.6, 5, {
        cuisine: 'turkish',
        priceRange: 2,
        certified: true,
      }, 'cursor-1');
    });
  });

  describe('getById', () => {
    it('should call halalService.getById with restaurant id', async () => {
      service.getById.mockResolvedValue({ id: 'r-1', name: 'Test Restaurant' } as any);

      const result = await controller.getById('r-1');

      expect(service.getById).toHaveBeenCalledWith('r-1');
      expect(result).toEqual(expect.objectContaining({ name: 'Test Restaurant' }));
    });
  });

  describe('create', () => {
    it('should call halalService.create with userId and dto', async () => {
      const dto = { name: 'Halal Kitchen', address: '123 Main', city: 'Sydney', country: 'AU', latitude: -33.8, longitude: 151.2 };
      service.create.mockResolvedValue({ id: 'r-1', ...dto } as any);

      const result = await controller.create(userId, dto as any);

      expect(service.create).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual(expect.objectContaining({ id: 'r-1' }));
    });
  });

  describe('addReview', () => {
    it('should call halalService.addReview with userId, restaurantId, rating, and comment', async () => {
      service.addReview.mockResolvedValue({ id: 'rev-1' } as any);

      const result = await controller.addReview(userId, 'r-1', { rating: 5, comment: 'Great food' } as any);

      expect(service.addReview).toHaveBeenCalledWith(userId, 'r-1', 5, 'Great food');
      expect(result).toEqual(expect.objectContaining({ id: 'rev-1' }));
    });
  });

  describe('getReviews', () => {
    it('should call halalService.getReviews with restaurantId and cursor', async () => {
      service.getReviews.mockResolvedValue({ data: [], meta: { hasMore: false } } as any);

      await controller.getReviews('r-1', 'cursor-1');

      expect(service.getReviews).toHaveBeenCalledWith('r-1', 'cursor-1');
    });
  });

  describe('verifyHalal', () => {
    it('should call halalService.verifyHalal with userId and restaurantId', async () => {
      service.verifyHalal.mockResolvedValue({ verified: true } as any);

      const result = await controller.verifyHalal(userId, 'r-1');

      expect(service.verifyHalal).toHaveBeenCalledWith(userId, 'r-1');
      expect(result).toEqual({ verified: true });
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { HalalService } from './halal.service';
import { PrismaService } from '../../config/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('HalalService', () => {
  let service: HalalService;
  let prisma: PrismaService;

  const mockPrisma = {
    halalRestaurant: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    halalReview: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    halalRestaurantReview: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 }, _count: 1 }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HalalService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HalalService>(HalalService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(HalalService);
  });

  describe('findNearby', () => {
    it('should return empty array when no restaurants found', async () => {
      mockPrisma.halalRestaurant.findMany.mockResolvedValue([]);
      const result = await service.findNearby(24.7, 46.6);
      expect(result).toBeDefined();
      expect(result.data).toEqual([]);
    });

    it('should calculate lat/lng delta from radius', async () => {
      mockPrisma.halalRestaurant.findMany.mockResolvedValue([]);
      await service.findNearby(24.7, 46.6, 25);
      expect(mockPrisma.halalRestaurant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            latitude: expect.any(Object),
            longitude: expect.any(Object),
          }),
        }),
      );
    });
  });

  describe('create', () => {
    it('should reject invalid price range', async () => {
      await expect(
        service.create('user-1', {
          name: 'Test Restaurant',
          address: '123 Main St',
          city: 'Test City',
          latitude: 24.7,
          longitude: 46.6,
          priceRange: 5,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create restaurant with valid data', async () => {
      const data = { name: 'Halal Kitchen', address: '123 Main', city: 'Riyadh', country: 'SA', latitude: 24.7, longitude: 46.6 };
      mockPrisma.halalRestaurant.create.mockResolvedValue({ id: 'r1', ...data });
      const result = await service.create('user-1', data);
      expect(result.id).toBe('r1');
      expect(result.name).toBe('Halal Kitchen');
    });
  });

  describe('getById', () => {
    it('should return restaurant with reviews', async () => {
      mockPrisma.halalRestaurant.findUnique.mockResolvedValue({ id: 'r1', name: 'Test', reviews: [{ id: 'rev-1' }] });
      const result = await service.getById('r1');
      expect(result.name).toBe('Test');
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.halalRestaurant.findUnique.mockResolvedValue(null);
      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addReview', () => {
    it('should create review and update average rating', async () => {
      mockPrisma.halalRestaurant.findUnique.mockResolvedValue({ id: 'r1' });
      mockPrisma.halalRestaurantReview.findUnique.mockResolvedValue(null);
      mockPrisma.halalRestaurantReview.create.mockResolvedValue({ id: 'rev-1', rating: 4, comment: 'Good' });
      mockPrisma.halalRestaurantReview.aggregate.mockResolvedValue({ _avg: { rating: 4.5 }, _count: 2 });
      mockPrisma.halalRestaurant.update.mockResolvedValue({});

      const result = await service.addReview('user-1', 'r1', 4, 'Good');
      expect(result.rating).toBe(4);
    });

    it('should throw BadRequestException for invalid rating', async () => {
      await expect(service.addReview('user-1', 'r1', 0)).rejects.toThrow(BadRequestException);
      await expect(service.addReview('user-1', 'r1', 6)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when restaurant not found', async () => {
      mockPrisma.halalRestaurant.findUnique.mockResolvedValue(null);
      await expect(service.addReview('user-1', 'nonexistent', 4)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getReviews', () => {
    it('should return reviews with pagination', async () => {
      mockPrisma.halalRestaurantReview.findMany.mockResolvedValue([{ id: 'rev-1', rating: 5 }]);
      const result = await service.getReviews('r1');
      expect(result.data).toHaveLength(1);
    });

    it('should return empty when no reviews', async () => {
      mockPrisma.halalRestaurantReview.findMany.mockResolvedValue([]);
      const result = await service.getReviews('r1');
      expect(result.data).toEqual([]);
    });
  });

  describe('verifyHalal', () => {
    it('should increment verify votes', async () => {
      mockPrisma.halalRestaurant.findUnique.mockResolvedValue({ id: 'r1', verifyVotes: 3, isVerified: false });
      mockPrisma.halalRestaurant.update.mockResolvedValue({ isVerified: false, verifyVotes: 4 });

      const result = await service.verifyHalal('user-1', 'r1');
      expect(result.votes).toBe(4);
    });

    it('should auto-verify at 5 votes', async () => {
      mockPrisma.halalRestaurant.findUnique.mockResolvedValue({ id: 'r1', verifyVotes: 4, isVerified: false });
      mockPrisma.halalRestaurant.update.mockResolvedValue({ isVerified: true, verifyVotes: 5 });

      const result = await service.verifyHalal('user-1', 'r1');
      expect(result.verified).toBe(true);
    });

    it('should throw NotFoundException when restaurant not found', async () => {
      mockPrisma.halalRestaurant.findUnique.mockResolvedValue(null);
      await expect(service.verifyHalal('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findNearby — additional', () => {
    it('should return restaurants sorted by distance', async () => {
      mockPrisma.halalRestaurant.findMany.mockResolvedValue([
        { id: 'r1', latitude: 24.72, longitude: 46.62, createdAt: new Date() },
        { id: 'r2', latitude: 24.71, longitude: 46.61, createdAt: new Date() },
      ]);

      const result = await service.findNearby(24.7, 46.6);
      expect(result.data).toHaveLength(2);
      // Should be sorted by distance
      expect(result.data[0].distanceKm).toBeLessThanOrEqual(result.data[1].distanceKm);
    });

    it('should apply cuisine filter', async () => {
      mockPrisma.halalRestaurant.findMany.mockResolvedValue([]);
      await service.findNearby(24.7, 46.6, 10, { cuisine: 'Turkish' });
      expect(mockPrisma.halalRestaurant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cuisineType: 'Turkish' }),
        }),
      );
    });
  });
});

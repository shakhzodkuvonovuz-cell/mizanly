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
  });
});

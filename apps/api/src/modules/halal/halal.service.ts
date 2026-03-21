import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class HalalService {
  constructor(private readonly prisma: PrismaService) {}

  async findNearby(
    lat: number,
    lng: number,
    radiusKm: number = 10,
    filters?: { cuisine?: string; priceRange?: number; certified?: boolean },
    cursor?: string,
    limit: number = 20,
  ) {
    // Haversine approximation: 1 degree ≈ 111km
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

    const where: Prisma.HalalRestaurantWhereInput = {
      latitude: { gte: lat - latDelta, lte: lat + latDelta },
      longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
      ...(filters?.cuisine ? { cuisineType: filters.cuisine } : {}),
      ...(filters?.priceRange ? { priceRange: filters.priceRange } : {}),
      ...(filters?.certified ? { halalCertified: true } : {}),
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    };

    const restaurants = await this.prisma.halalRestaurant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = restaurants.length > limit;
    if (hasMore) restaurants.pop();

    // Calculate distances
    const withDistance = restaurants.map((r) => ({
      ...r,
      distanceKm: this.haversineDistance(lat, lng, r.latitude, r.longitude),
    }));

    // Sort by distance
    withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
    return {
      data: withDistance,
      meta: {
        hasMore,
        cursor: hasMore ? restaurants[restaurants.length - 1].createdAt.toISOString() : undefined,
      },
    };
  }

  async getById(id: string) {
    const restaurant = await this.prisma.halalRestaurant.findUnique({
      where: { id },
      include: {
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant;
  }

  async create(userId: string, data: {
    name: string;
    address: string;
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    cuisineType?: string;
    priceRange?: number;
    halalCertified?: boolean;
    certifyingBody?: string;
    phone?: string;
    website?: string;
    imageUrl?: string;
  }) {
    if (data.priceRange && (data.priceRange < 1 || data.priceRange > 4)) {
      throw new BadRequestException('Price range must be 1-4');
    }

    return this.prisma.halalRestaurant.create({
      data: {
        ...data,
        addedById: userId,
      },
    });
  }

  async addReview(userId: string, restaurantId: string, rating: number, comment?: string) {
    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be 1-5');
    }

    const restaurant = await this.prisma.halalRestaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    // Check if already reviewed
    const existing = await this.prisma.halalRestaurantReview.findUnique({
      where: { restaurantId_userId: { restaurantId, userId } },
    });
    if (existing) throw new ConflictException('Already reviewed this restaurant');

    const review = await this.prisma.halalRestaurantReview.create({
      data: { restaurantId, userId, rating, comment },
    });

    // Update average rating
    const agg = await this.prisma.halalRestaurantReview.aggregate({
      where: { restaurantId },
      _avg: { rating: true },
      _count: true,
    });

    await this.prisma.halalRestaurant.update({
      where: { id: restaurantId },
      data: {
        averageRating: agg._avg.rating ?? 0,
        reviewCount: agg._count,
      },
    });

    return review;
  }

  async getReviews(restaurantId: string, cursor?: string, limit: number = 20) {
    const reviews = await this.prisma.halalRestaurantReview.findMany({
      where: {
        restaurantId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = reviews.length > limit;
    if (hasMore) reviews.pop();
    return {
      data: reviews,
      meta: {
        hasMore,
        cursor: hasMore ? reviews[reviews.length - 1].createdAt.toISOString() : undefined,
      },
    };
  }

  async verifyHalal(userId: string, restaurantId: string) {
    const restaurant = await this.prisma.halalRestaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    // Check if user already voted (use review as proxy for vote tracking)
    const existingReview = await this.prisma.halalRestaurantReview.findUnique({
      where: { restaurantId_userId: { restaurantId, userId } },
    });
    if (existingReview) throw new ConflictException('Already verified this restaurant');

    const updated = await this.prisma.halalRestaurant.update({
      where: { id: restaurantId },
      data: {
        verifyVotes: { increment: 1 },
        isVerified: restaurant.verifyVotes + 1 >= 5 ? true : restaurant.isVerified,
      },
    });

    return { verified: updated.isVerified, votes: updated.verifyVotes };
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10; // round to 1 decimal
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}

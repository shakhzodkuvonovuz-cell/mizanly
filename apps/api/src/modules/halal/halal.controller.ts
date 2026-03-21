import { Controller, Get, Post, Param, Query, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max, MaxLength, IsUrl } from 'class-validator';
import { HalalService } from './halal.service';

class CreateRestaurantDto {
  @IsString() @MaxLength(200) name: string;
  @IsString() @MaxLength(500) address: string;
  @IsString() @MaxLength(100) city: string;
  @IsString() @MaxLength(100) country: string;
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
  @IsOptional() @IsString() @MaxLength(50) cuisineType?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(4) priceRange?: number;
  @IsOptional() @IsBoolean() halalCertified?: boolean;
  @IsOptional() @IsString() @MaxLength(200) certifyingBody?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsUrl() website?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
}

class AddReviewDto {
  @IsNumber() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() comment?: string;
}

@ApiTags('Halal Finder')
@ApiBearerAuth()
@Controller('halal/restaurants')
export class HalalController {
  constructor(private readonly halalService: HalalService) {}

  @UseGuards(OptionalClerkAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Find nearby halal restaurants' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  @ApiQuery({ name: 'radius', required: false, type: Number })
  @ApiQuery({ name: 'cuisine', required: false, type: String })
  @ApiQuery({ name: 'priceRange', required: false, type: Number })
  @ApiQuery({ name: 'certified', required: false, type: Boolean })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async findNearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
    @Query('cuisine') cuisine?: string,
    @Query('priceRange') priceRange?: string,
    @Query('certified') certified?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.halalService.findNearby(
      parseFloat(lat),
      parseFloat(lng),
      radius ? parseInt(radius, 10) : 10,
      {
        cuisine,
        priceRange: priceRange ? parseInt(priceRange, 10) : undefined,
        certified: certified === 'true',
      },
      cursor,
    );
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get restaurant detail with reviews' })
  async getById(@Param('id') id: string) {
    return this.halalService.getById(id);
  }

  @UseGuards(ClerkAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Add a halal restaurant (community-contributed)' })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateRestaurantDto,
  ) {
    return this.halalService.create(userId, dto);
  }

  @UseGuards(ClerkAuthGuard)
  @Post(':id/reviews')
  @ApiOperation({ summary: 'Add a review' })
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async addReview(
    @CurrentUser('id') userId: string,
    @Param('id') restaurantId: string,
    @Body() dto: AddReviewDto,
  ) {
    return this.halalService.addReview(userId, restaurantId, dto.rating, dto.comment);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get(':id/reviews')
  @ApiOperation({ summary: 'Get restaurant reviews' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async getReviews(
    @Param('id') restaurantId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.halalService.getReviews(restaurantId, cursor);
  }

  @UseGuards(ClerkAuthGuard)
  @Post(':id/verify')
  @ApiOperation({ summary: 'Community verify halal status' })
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async verifyHalal(
    @CurrentUser('id') userId: string,
    @Param('id') restaurantId: string,
  ) {
    return this.halalService.verifyHalal(userId, restaurantId);
  }
}

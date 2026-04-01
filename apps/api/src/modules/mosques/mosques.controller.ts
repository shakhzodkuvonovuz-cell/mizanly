import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsString, IsNumber, IsOptional, IsArray, MaxLength, Min, Max, IsUrl, ArrayMaxSize, IsEnum } from 'class-validator';
import { MadhhabType } from '@prisma/client';
import { MosquesService } from './mosques.service';

class CreateMosqueDto {
  @IsString() @MaxLength(200) name: string;
  @IsString() @MaxLength(500) address: string;
  @IsString() @MaxLength(100) city: string;
  @IsString() @MaxLength(100) country: string;
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
  @IsOptional() @IsEnum(MadhhabType) madhab?: MadhhabType;
  @IsOptional() @IsString() @MaxLength(10) language?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @IsUrl() website?: string;
  @IsOptional() @IsString() @IsUrl() imageUrl?: string;
}

class CreateMosquePostDto {
  @IsString() @MaxLength(5000) content: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) mediaUrls?: string[];
}

@ApiTags('Mosque Communities')
@ApiBearerAuth()
@Controller('mosques')
export class MosquesController {
  constructor(private readonly mosquesService: MosquesService) {}

  @UseGuards(OptionalClerkAuthGuard)
  @Get('nearby')
  @ApiOperation({ summary: 'Find nearby mosques' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  @ApiQuery({ name: 'radius', required: false, type: Number })
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async findNearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
  ) {
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng) || parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
      throw new BadRequestException('lat must be -90..90 and lng must be -180..180');
    }
    return this.mosquesService.findNearby(
      parsedLat,
      parsedLng,
      radius ? Math.min(Math.max(parseInt(radius, 10) || 15, 1), 100) : 15,
    );
  }

  @UseGuards(ClerkAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Create a mosque community' })
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateMosqueDto) {
    return this.mosquesService.create(userId, dto);
  }

  @UseGuards(ClerkAuthGuard)
  @Get('my/memberships')
  @ApiOperation({ summary: 'Get user mosque memberships' })
  async getMyMosques(@CurrentUser('id') userId: string) {
    return this.mosquesService.getMyMosques(userId);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Get mosque detail' })
  async getById(@Param('id') id: string) {
    return this.mosquesService.getById(id);
  }

  @UseGuards(ClerkAuthGuard)
  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a mosque community' })
  async join(@CurrentUser('id') userId: string, @Param('id') mosqueId: string) {
    return this.mosquesService.join(userId, mosqueId);
  }

  @UseGuards(ClerkAuthGuard)
  @Delete(':id/leave')
  @ApiOperation({ summary: 'Leave a mosque community' })
  async leave(@CurrentUser('id') userId: string, @Param('id') mosqueId: string) {
    return this.mosquesService.leave(userId, mosqueId);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get(':id/feed')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Get mosque community feed' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async getFeed(@Param('id') mosqueId: string, @Query('cursor') cursor?: string) {
    return this.mosquesService.getFeed(mosqueId, cursor);
  }

  @UseGuards(ClerkAuthGuard)
  @Post(':id/posts')
  @ApiOperation({ summary: 'Post to mosque community (members only)' })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async createPost(
    @CurrentUser('id') userId: string,
    @Param('id') mosqueId: string,
    @Body() dto: CreateMosquePostDto,
  ) {
    return this.mosquesService.createPost(userId, mosqueId, dto.content, dto.mediaUrls);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get(':id/members')
  @ApiOperation({ summary: 'List mosque members' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async getMembers(@Param('id') mosqueId: string, @Query('cursor') cursor?: string) {
    return this.mosquesService.getMembers(mosqueId, cursor);
  }
}

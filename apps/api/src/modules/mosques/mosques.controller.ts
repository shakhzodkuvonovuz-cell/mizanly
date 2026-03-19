import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';
import { MosquesService } from './mosques.service';

class CreateMosqueDto {
  @IsString() name: string;
  @IsString() address: string;
  @IsString() city: string;
  @IsString() country: string;
  @IsNumber() latitude: number;
  @IsNumber() longitude: number;
  @IsOptional() @IsString() madhab?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() imageUrl?: string;
}

class CreateMosquePostDto {
  @IsString() content: string;
  @IsOptional() @IsArray() mediaUrls?: string[];
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
    return this.mosquesService.findNearby(
      parseFloat(lat),
      parseFloat(lng),
      radius ? parseInt(radius, 10) : 15,
    );
  }

  @UseGuards(ClerkAuthGuard)
  @Post()
  @ApiOperation({ summary: 'Create a mosque community' })
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateMosqueDto) {
    return this.mosquesService.create(userId, dto);
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

  @UseGuards(ClerkAuthGuard)
  @Get('my/memberships')
  @ApiOperation({ summary: 'Get user mosque memberships' })
  async getMyMosques(@CurrentUser('id') userId: string) {
    return this.mosquesService.getMyMosques(userId);
  }
}

import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus, BadRequestException, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FeedContentType } from '@prisma/client';
import { FeedService } from './feed.service';
import { FeedTransparencyService } from './feed-transparency.service';
import { PersonalizedFeedService } from './personalized-feed.service';
import { LogInteractionDto } from './dto/log-interaction.dto';
import { FeaturePostDto } from './dto/feature-post.dto';
import { TrackSessionSignalDto } from './dto/track-session-signal.dto';

@ApiTags('Feed Intelligence')
@ApiBearerAuth()
@Controller('feed')
export class FeedController {
  constructor(
    private feed: FeedService,
    private transparency: FeedTransparencyService,
    private personalizedFeed: PersonalizedFeedService,
  ) {}

  @UseGuards(ClerkAuthGuard)
  @Post('interaction') @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @ApiOperation({ summary: 'Log interaction' })
  async log(@CurrentUser('id') userId: string, @Body() dto: LogInteractionDto) {
    return this.feed.logInteraction(userId, dto);
  }

  @UseGuards(ClerkAuthGuard)
  @Post('dismiss/:contentType/:contentId') @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Dismiss content' })
  async dismiss(
    @CurrentUser('id') userId: string,
    @Param('contentType') t: string,
    @Param('contentId') id: string,
  ) {
    const validTypes = ['post', 'reel', 'thread', 'video'];
    if (!validTypes.includes(t)) {
      throw new BadRequestException(`Invalid contentType: ${t}. Must be one of: ${validTypes.join(', ')}`);
    }
    return this.feed.dismiss(userId, id, t as FeedContentType);
  }

  @UseGuards(ClerkAuthGuard)
  @Delete('dismiss/:contentType/:contentId') @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Undismiss' })
  async undismiss(
    @CurrentUser('id') userId: string,
    @Param('contentType') t: string,
    @Param('contentId') id: string,
  ) {
    const validTypes = ['post', 'reel', 'thread', 'video'];
    if (!validTypes.includes(t)) {
      throw new BadRequestException(`Invalid contentType: ${t}. Must be one of: ${validTypes.join(', ')}`);
    }
    return this.feed.undismiss(userId, id, t as FeedContentType);
  }

  // Finding #402: Trending in your community
  @Get('community-trending')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trending posts from hashtags you follow' })
  async getCommunityTrending(@CurrentUser('id') userId: string) {
    return this.feed.getCommunityTrending(userId);
  }

  // Finding #406: On This Day memories
  @Get('on-this-day')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get posts from the same date in previous years ("On This Day")' })
  async getOnThisDay(@CurrentUser('id') userId: string) {
    return this.feed.getOnThisDay(userId);
  }

  // Finding #295: Reset algorithm
  @Delete('reset-algorithm')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 1 } })
  @ApiOperation({ summary: 'Reset your feed algorithm — clears all interactions and preferences' })
  async resetAlgorithm(@CurrentUser('id') userId: string) {
    return this.feed.resetAlgorithm(userId);
  }

  @UseGuards(ClerkAuthGuard)
  @Get('explain/post/:postId')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Explain why a post appeared in feed' })
  async explainPost(
    @CurrentUser('id') userId: string,
    @Param('postId') postId: string,
  ) {
    return this.transparency.explainPost(userId, postId);
  }

  @UseGuards(ClerkAuthGuard)
  @Get('explain/thread/:threadId')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Explain why a thread appeared in feed' })
  async explainThread(
    @CurrentUser('id') userId: string,
    @Param('threadId') threadId: string,
  ) {
    return this.transparency.explainThread(userId, threadId);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('search/enhanced')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Enhanced keyword search across posts' })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async enhancedSearch(
    @CurrentUser('id') userId: string | undefined,
    @Query('q') q: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Math.min(Math.max(1, limit ? parseInt(limit, 10) : 20), 50);
    return this.transparency.enhancedSearch(q, cursor, parsedLimit, userId);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('personalized')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Get personalized feed (pgvector + Islamic boost + session signals)' })
  @ApiQuery({ name: 'space', required: true, enum: ['saf', 'bakra', 'majlis', 'minbar'] })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'lat', required: false, type: Number, description: 'User latitude for location-aware Islamic boost' })
  @ApiQuery({ name: 'lng', required: false, type: Number, description: 'User longitude for location-aware Islamic boost' })
  async getPersonalized(
    @CurrentUser('id') userId: string | undefined,
    @Query('space') space: 'saf' | 'bakra' | 'majlis',
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const validSpaces = ['saf', 'bakra', 'majlis', 'minbar'] as const;
    const safeSpace = validSpaces.includes(space as typeof validSpaces[number]) ? space : 'saf';
    const parsedLimit = Math.min(Math.max(1, limit ? parseInt(limit, 10) : 20), 50);
    const userLat = lat ? parseFloat(lat) : undefined;
    const userLng = lng ? parseFloat(lng) : undefined;
    return this.personalizedFeed.getPersonalizedFeed(
      userId,
      safeSpace as 'saf' | 'bakra' | 'majlis',
      cursor,
      parsedLimit,
      !isNaN(userLat as number) ? userLat : undefined,
      !isNaN(userLng as number) ? userLng : undefined,
    );
  }

  @UseGuards(ClerkAuthGuard)
  @Post('session-signal') @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @ApiOperation({ summary: 'Track in-session feed signal for real-time adaptation' })
  async trackSessionSignal(
    @CurrentUser('id') userId: string,
    @Body() body: TrackSessionSignalDto,
  ) {
    await this.personalizedFeed.trackSessionSignal(userId, body);
    return;
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('trending')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Trending posts scored by engagement rate (anonymous-safe)' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTrending(
    @CurrentUser('id') userId: string | undefined,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Math.min(Math.max(1, limit ? parseInt(limit, 10) : 20), 50);
    return this.feed.getTrendingFeed(cursor, parsedLimit, userId);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('featured')
  @Header('Cache-Control', 'public, max-age=120, stale-while-revalidate=300')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Staff-picked / featured posts (anonymous-safe)' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFeatured(
    @CurrentUser('id') userId: string | undefined,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Math.min(Math.max(1, limit ? parseInt(limit, 10) : 20), 50);
    return this.feed.getFeaturedFeed(cursor, parsedLimit, userId);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('suggested-users')
  @Header('Cache-Control', 'public, max-age=120, stale-while-revalidate=300')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Suggested users to follow (for in-feed cards)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSuggestedUsers(
    @CurrentUser('id') userId: string | undefined,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Math.min(Math.max(1, limit ? parseInt(limit, 10) : 5), 50);
    return this.feed.getSuggestedUsers(userId, parsedLimit);
  }

  @UseGuards(ClerkAuthGuard)
  @Get('frequent-creators')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Get creators the user frequently engages with' })
  async getFrequentCreators(@CurrentUser('id') userId: string) {
    return this.feed.getFrequentCreators(userId);
  }

  @UseGuards(ClerkAuthGuard)
  @Put('admin/posts/:id/feature')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Feature or unfeature a post (admin only)' })
  async featurePost(
    @CurrentUser('id') userId: string,
    @Param('id') postId: string,
    @Body() body: FeaturePostDto,
  ) {
    return this.feed.featurePost(postId, body.featured, userId);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('nearby')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Get nearby content based on location' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  @ApiQuery({ name: 'radiusKm', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async getNearby(
    @CurrentUser('id') userId: string | undefined,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radiusKm') radiusKm?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLat = Math.max(-90, Math.min(90, parseFloat(lat) || 0));
    const parsedLng = Math.max(-180, Math.min(180, parseFloat(lng) || 0));
    const parsedRadius = Math.max(1, Math.min(500, radiusKm ? parseFloat(radiusKm) : 25));
    return this.feed.getNearbyContent(
      parsedLat,
      parsedLng,
      parsedRadius,
      cursor,
      userId,
    );
  }
}
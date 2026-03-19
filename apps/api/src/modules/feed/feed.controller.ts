import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FeedService } from './feed.service';
import { FeedTransparencyService } from './feed-transparency.service';
import { PersonalizedFeedService } from './personalized-feed.service';
import { LogInteractionDto } from './dto/log-interaction.dto';

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
  @ApiOperation({ summary: 'Log interaction' })
  async log(@CurrentUser('id') userId: string, @Body() dto: LogInteractionDto) {
    return this.feed.logInteraction(userId, dto);
  }

  @UseGuards(ClerkAuthGuard)
  @Post('dismiss/:contentType/:contentId') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss content' })
  async dismiss(
    @CurrentUser('id') userId: string,
    @Param('contentType') t: string,
    @Param('contentId') id: string,
  ) {
    return this.feed.dismiss(userId, id, t);
  }

  @UseGuards(ClerkAuthGuard)
  @Delete('dismiss/:contentType/:contentId') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undismiss' })
  async undismiss(
    @CurrentUser('id') userId: string,
    @Param('contentType') t: string,
    @Param('contentId') id: string,
  ) {
    return this.feed.undismiss(userId, id, t);
  }

  @UseGuards(ClerkAuthGuard)
  @Get('explain/post/:postId')
  @ApiOperation({ summary: 'Explain why a post appeared in feed' })
  async explainPost(
    @CurrentUser('id') userId: string,
    @Param('postId') postId: string,
  ) {
    return this.transparency.explainPost(userId, postId);
  }

  @UseGuards(ClerkAuthGuard)
  @Get('explain/thread/:threadId')
  @ApiOperation({ summary: 'Explain why a thread appeared in feed' })
  async explainThread(
    @CurrentUser('id') userId: string,
    @Param('threadId') threadId: string,
  ) {
    return this.transparency.explainThread(userId, threadId);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('search/enhanced')
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
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.transparency.enhancedSearch(q, cursor, parsedLimit, userId);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('personalized')
  @ApiOperation({ summary: 'Get personalized feed (pgvector + Islamic boost + session signals)' })
  @ApiQuery({ name: 'space', required: true, enum: ['saf', 'bakra', 'majlis'] })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getPersonalized(
    @CurrentUser('id') userId: string | undefined,
    @Query('space') space: 'saf' | 'bakra' | 'majlis',
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.personalizedFeed.getPersonalizedFeed(
      userId,
      space,
      cursor,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @UseGuards(ClerkAuthGuard)
  @Post('session-signal') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track in-session feed signal for real-time adaptation' })
  async trackSessionSignal(
    @CurrentUser('id') userId: string,
    @Body() body: { contentId: string; action: 'view' | 'like' | 'save' | 'share' | 'skip'; hashtags?: string[]; scrollPosition?: number },
  ) {
    this.personalizedFeed.trackSessionSignal(userId, body);
    return { success: true };
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('trending')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Trending posts scored by engagement rate (anonymous-safe)' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTrending(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.feed.getTrendingFeed(cursor, limit ? parseInt(limit, 10) : 20);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('featured')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Staff-picked / featured posts (anonymous-safe)' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFeatured(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.feed.getFeaturedFeed(cursor, limit ? parseInt(limit, 10) : 20);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('suggested-users')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Suggested users to follow (for in-feed cards)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSuggestedUsers(
    @CurrentUser('id') userId: string | undefined,
    @Query('limit') limit?: string,
  ) {
    return this.feed.getSuggestedUsers(userId, limit ? parseInt(limit, 10) : 5);
  }

  @UseGuards(ClerkAuthGuard)
  @Get('frequent-creators')
  @ApiOperation({ summary: 'Get creators the user frequently engages with' })
  async getFrequentCreators(@CurrentUser('id') userId: string) {
    return this.feed.getFrequentCreators(userId);
  }

  @UseGuards(ClerkAuthGuard)
  @Put('admin/posts/:id/feature')
  @ApiOperation({ summary: 'Feature or unfeature a post (admin)' })
  async featurePost(
    @Param('id') postId: string,
    @Body() body: { featured: boolean },
  ) {
    return this.feed.featurePost(postId, body.featured);
  }

  @UseGuards(OptionalClerkAuthGuard)
  @Get('nearby')
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
    return this.feed.getNearbyContent(
      parseFloat(lat),
      parseFloat(lng),
      radiusKm ? parseFloat(radiusKm) : 25,
      cursor,
      userId,
    );
  }
}
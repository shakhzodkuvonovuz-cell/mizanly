import { Throttle } from '@nestjs/throttler';
import { Controller, Get, Post, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { HashtagsService } from './hashtags.service';
import { TrendingQueryDto, SearchQueryDto } from './dto/hashtag-query.dto';

@ApiTags('Hashtags')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('hashtags')
export class HashtagsController {
  constructor(private service: HashtagsService) {}

  @Get('trending')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get trending hashtags' })
  async getTrending(@Query() dto: TrendingQueryDto) {
    const limitNum = dto.limit ? Math.min(parseInt(dto.limit, 10), 100) : 50;
    return this.service.getTrendingRaw(limitNum);
  }

  @Get('search')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Search hashtags by prefix' })
  async search(@Query() dto: SearchQueryDto) {
    if (!dto.q) return { data: [], meta: { total: 0 } };
    const limitNum = dto.limit ? Math.min(parseInt(dto.limit, 10), 50) : 20;
    return this.service.search(dto.q, limitNum);
  }

  @Get('following')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get hashtags the user follows' })
  async getFollowedHashtags(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.getFollowedHashtags(userId, cursor);
  }

  @Get(':name')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get hashtag details' })
  async getByName(@Param('name') name: string) {
    return this.service.getByName(name);
  }

  @Get(':name/posts')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get posts with this hashtag' })
  async getPosts(
    @Param('name') name: string,
    @CurrentUser('id') userId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.getPostsByHashtag(name, userId, cursor);
  }

  @Get(':name/reels')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get reels with this hashtag' })
  async getReels(
    @Param('name') name: string,
    @CurrentUser('id') userId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.getReelsByHashtag(name, userId, cursor);
  }

  @Get(':name/threads')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get threads with this hashtag' })
  async getThreads(
    @Param('name') name: string,
    @CurrentUser('id') userId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.getThreadsByHashtag(name, userId, cursor);
  }

  @Post(':id/follow')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Follow a hashtag' })
  async followHashtag(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.followHashtag(userId, id);
  }

  @Delete(':id/follow')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unfollow a hashtag' })
  async unfollowHashtag(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.unfollowHashtag(userId, id);
  }
}
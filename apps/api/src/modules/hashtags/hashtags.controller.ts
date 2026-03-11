import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { HashtagsService } from './hashtags.service';

@ApiTags('Hashtags')
@Controller('api/v1/hashtags')
export class HashtagsController {
  constructor(private service: HashtagsService) {}

  @Get('trending')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get trending hashtags' })
  async getTrending(@Query('limit') limit?: string) {
    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 50;
    return this.service.getTrendingRaw(limitNum);
  }

  @Get('search')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Search hashtags by prefix' })
  async search(@Query('q') query: string, @Query('limit') limit?: string) {
    if (!query) return { data: [], meta: { total: 0 } };
    const limitNum = limit ? Math.min(parseInt(limit, 10), 50) : 20;
    return this.service.search(query, limitNum);
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
}
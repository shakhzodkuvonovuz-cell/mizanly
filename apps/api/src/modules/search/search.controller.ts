import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SearchService } from './search.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type SearchType = 'people' | 'threads' | 'posts' | 'tags' | 'reels' | 'videos' | 'channels';

@ApiTags('Search & Discover')
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  search(
    @Query('q') query: string,
    @Query('type') type?: SearchType,
    @Query('cursor') cursor?: string
  ) {
    return this.searchService.search(query, type, cursor);
  }

  @Get('trending')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  trending() { return this.searchService.trending(); }

  @Get('hashtag/:tag')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  getHashtagPosts(
    @Param('tag') tag: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.searchService.getHashtagPosts(tag, cursor);
  }

  @Get('suggested-users')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  suggestedUsers(@CurrentUser('id') userId: string) { return this.searchService.suggestedUsers(userId); }

  @Get('posts')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @UseGuards(OptionalClerkAuthGuard)
  searchPosts(
    @Query('q') query: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 20,
    @CurrentUser('id') userId?: string,
  ) {
    return this.searchService.searchPosts(query, userId, cursor, limit);
  }

  @Get('threads')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  searchThreads(
    @Query('q') query: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 20,
  ) {
    return this.searchService.searchThreads(query, cursor, limit);
  }

  @Get('reels')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  searchReels(
    @Query('q') query: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 20,
  ) {
    return this.searchService.searchReels(query, cursor, limit);
  }

  @Get('explore')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  exploreFeed(
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 20,
  ) {
    return this.searchService.getExploreFeed(cursor, limit);
  }

  @Get('suggestions')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  querySuggestions(
    @Query('q') query: string,
    @Query('limit') limit?: number,
  ) {
    return this.searchService.getSuggestions(query, limit);
  }
}

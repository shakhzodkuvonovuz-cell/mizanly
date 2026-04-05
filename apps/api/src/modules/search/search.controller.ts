import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SearchService } from './search.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SearchQueryDto, SearchSuggestionsDto, HashtagSearchDto } from './dto/search-query.dto';

@ApiTags('Search & Discover')
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  @UseGuards(OptionalClerkAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Universal search across all content types' })
  search(
    @Query() dto: SearchQueryDto,
    @CurrentUser('id') userId?: string,
  ) {
    const safeLimit = Math.min(Math.max(1, dto.limit ? parseInt(dto.limit, 10) || 20 : 20), 50);
    return this.searchService.search(dto.q, dto.type, dto.cursor, safeLimit, userId);
  }

  @Get('trending')
  @UseGuards(OptionalClerkAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Get trending hashtags and topics' })
  trending(@CurrentUser('id') userId?: string) { return this.searchService.trending(userId); }

  @Get('hashtag/:tag')
  @UseGuards(OptionalClerkAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Get posts for a specific hashtag' })
  getHashtagPosts(
    @Param('tag') tag: string,
    @Query() dto: HashtagSearchDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.searchService.getHashtagPosts(tag, dto.cursor, undefined, userId);
  }

  @Get('suggested-users')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Get suggested users to follow' })
  suggestedUsers(@CurrentUser('id') userId: string) { return this.searchService.suggestedUsers(userId); }

  @Get('posts')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Search posts by query string' })
  searchPosts(
    @Query() dto: SearchQueryDto,
    @CurrentUser('id') userId?: string,
  ) {
    const safeLimit = Math.min(Math.max(1, dto.limit ? parseInt(dto.limit, 10) || 20 : 20), 50);
    return this.searchService.searchPosts(dto.q, userId, dto.cursor, safeLimit);
  }

  @Get('threads')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Search threads by query string' })
  searchThreads(
    @Query() dto: SearchQueryDto,
    @CurrentUser('id') userId?: string,
  ) {
    const safeLimit = Math.min(Math.max(1, dto.limit ? parseInt(dto.limit, 10) || 20 : 20), 50);
    return this.searchService.searchThreads(dto.q, dto.cursor, safeLimit, userId);
  }

  @Get('reels')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Search reels by query string' })
  searchReels(
    @Query() dto: SearchQueryDto,
    @CurrentUser('id') userId?: string,
  ) {
    const safeLimit = Math.min(Math.max(1, dto.limit ? parseInt(dto.limit, 10) || 20 : 20), 50);
    return this.searchService.searchReels(dto.q, dto.cursor, safeLimit, userId);
  }

  @Get('explore')
  @UseGuards(OptionalClerkAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Get explore/discovery feed' })
  exploreFeed(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @CurrentUser('id') userId?: string,
  ) {
    const safeLimit = Math.min(Math.max(1, limit ? parseInt(limit, 10) || 20 : 20), 50);
    return this.searchService.getExploreFeed(cursor, safeLimit, userId);
  }

  @Get('suggestions')
  @UseGuards(OptionalClerkAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Get search query autocomplete suggestions' })
  querySuggestions(
    @Query() dto: SearchSuggestionsDto,
    @CurrentUser('id') userId?: string,
  ) {
    const safeLimit = Math.min(Math.max(1, dto.limit ? parseInt(dto.limit, 10) || 10 : 10), 20);
    return this.searchService.getSuggestions(dto.q || '', safeLimit, userId);
  }
}

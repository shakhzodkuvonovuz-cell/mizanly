import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type SearchType = 'people' | 'threads' | 'posts' | 'tags';

@ApiTags('Search & Discover')
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  search(
    @Query('q') query: string,
    @Query('type') type?: SearchType,
    @Query('cursor') cursor?: string
  ) {
    return this.searchService.search(query, type, cursor);
  }

  @Get('trending')
  trending() { return this.searchService.trending(); }

  @Get('hashtag/:tag')
  getHashtagPosts(
    @Param('tag') tag: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.searchService.getHashtagPosts(tag, cursor);
  }

  @Get('suggestions')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  suggestedUsers(@CurrentUser('id') userId: string) { return this.searchService.suggestedUsers(userId); }
}

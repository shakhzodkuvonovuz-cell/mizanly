import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Search & Discover')
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  search(@Query('q') query: string, @Query('type') type?: string) {
    return this.searchService.search(query, type as any);
  }

  @Get('trending')
  trending() { return this.searchService.trending(); }

  @Get('suggestions')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  suggestedUsers(@CurrentUser('id') userId: string) { return this.searchService.suggestedUsers(userId); }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { GiphyService, GiphyProxyResult } from './giphy.service';

@ApiTags('Giphy')
@Controller('giphy')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class GiphyController {
  constructor(private readonly giphyService: GiphyService) {}

  @Get('search')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Search GIPHY for GIFs (proxied, API key stays server-side)' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of results (1-50, default 25)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Pagination offset (default 0)' })
  @ApiQuery({ name: 'rating', required: false, description: 'Content rating: g, pg, pg-13, r (default pg-13)' })
  @ApiResponse({ status: 200, description: 'GIPHY search results' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  async search(
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('rating') rating?: string,
  ): Promise<GiphyProxyResult> {
    return this.giphyService.search({
      q,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      rating,
    });
  }

  @Get('trending')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Get trending GIFs from GIPHY (proxied, API key stays server-side)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of results (1-50, default 25)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Pagination offset (default 0)' })
  @ApiQuery({ name: 'rating', required: false, description: 'Content rating: g, pg, pg-13, r (default pg-13)' })
  @ApiResponse({ status: 200, description: 'GIPHY trending results' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  async trending(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('rating') rating?: string,
  ): Promise<GiphyProxyResult> {
    return this.giphyService.trending({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      rating,
    });
  }
}

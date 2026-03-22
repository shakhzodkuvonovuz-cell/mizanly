import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RecommendationsService } from './recommendations.service';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Recommendations')
@ApiBearerAuth()
@Controller('recommendations')
export class RecommendationsController {
  constructor(private recommendationsService: RecommendationsService) {}

  @Get('people')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'People you may know (mutual follows, similar interests)' })
  suggestedPeople(
    @CurrentUser('id') userId?: string,
    @Query('limit') limit?: number,
  ) {
    const safeLimit = Math.min(Math.max(1, limit || 20), 50);
    return this.recommendationsService.suggestedPeople(userId, safeLimit);
  }

  @Get('posts')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Suggested posts (high engagement, not yet seen)' })
  suggestedPosts(
    @CurrentUser('id') userId?: string,
    @Query('limit') limit?: number,
  ) {
    const safeLimit = Math.min(Math.max(1, limit || 20), 50);
    return this.recommendationsService.suggestedPosts(userId, safeLimit);
  }

  @Get('reels')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Suggested reels' })
  suggestedReels(
    @CurrentUser('id') userId?: string,
    @Query('limit') limit?: number,
  ) {
    const safeLimit = Math.min(Math.max(1, limit || 20), 50);
    return this.recommendationsService.suggestedReels(userId, safeLimit);
  }

  @Get('channels')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Suggested channels' })
  suggestedChannels(
    @CurrentUser('id') userId?: string,
    @Query('limit') limit?: number,
  ) {
    const safeLimit = Math.min(Math.max(1, limit || 20), 50);
    return this.recommendationsService.suggestedChannels(userId, safeLimit);
  }

  @Get('threads')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Suggested threads (pgvector ranking)' })
  suggestedThreads(
    @CurrentUser('id') userId?: string,
    @Query('limit') limit?: number,
  ) {
    const safeLimit = Math.min(Math.max(1, limit || 20), 50);
    return this.recommendationsService.suggestedThreads(userId, safeLimit);
  }
}

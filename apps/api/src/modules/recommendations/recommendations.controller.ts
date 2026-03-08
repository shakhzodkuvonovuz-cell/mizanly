import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private recommendationsService: RecommendationsService) {}

  @Get('people')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'People you may know (mutual follows, similar interests)' })
  suggestedPeople(
    @CurrentUser('id') userId?: string,
    @Query('limit') limit?: number,
  ) {
    return this.recommendationsService.suggestedPeople(userId, limit);
  }

  @Get('posts')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Suggested posts (high engagement, not yet seen)' })
  suggestedPosts(
    @CurrentUser('id') userId?: string,
    @Query('limit') limit?: number,
  ) {
    return this.recommendationsService.suggestedPosts(userId, limit);
  }

  @Get('reels')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Suggested reels' })
  suggestedReels(
    @CurrentUser('id') userId?: string,
    @Query('limit') limit?: number,
  ) {
    return this.recommendationsService.suggestedReels(userId, limit);
  }

  @Get('channels')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Suggested channels' })
  suggestedChannels(
    @CurrentUser('id') userId?: string,
    @Query('limit') limit?: number,
  ) {
    return this.recommendationsService.suggestedChannels(userId, limit);
  }
}
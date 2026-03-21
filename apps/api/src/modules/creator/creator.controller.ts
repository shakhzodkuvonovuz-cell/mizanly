import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength } from 'class-validator';
import { CreatorService } from './creator.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class AskAIDto {
  @IsString() @MaxLength(1000) question: string;
}

@ApiTags('Creator Analytics')
@Controller('creator')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class CreatorController {
  constructor(private creatorService: CreatorService) {}

  @Get('insights/post/:postId')
  @ApiOperation({ summary: 'Get engagement insights for a specific post' })
  @ApiResponse({ status: 200, description: 'Post insights returned' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  @ApiResponse({ status: 403, description: 'Not your post' })
  getPostInsights(
    @Param('postId') postId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.creatorService.getPostInsights(postId, userId);
  }

  @Get('insights/reel/:reelId')
  @ApiOperation({ summary: 'Get engagement insights for a specific reel' })
  @ApiResponse({ status: 200, description: 'Reel insights returned' })
  @ApiResponse({ status: 404, description: 'Reel not found' })
  @ApiResponse({ status: 403, description: 'Not your reel' })
  getReelInsights(
    @Param('reelId') reelId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.creatorService.getReelInsights(reelId, userId);
  }

  @Get('analytics/overview')
  @ApiOperation({ summary: 'Get creator dashboard overview with aggregate stats' })
  @ApiResponse({ status: 200, description: 'Dashboard overview returned' })
  getDashboardOverview(@CurrentUser('id') userId: string) {
    return this.creatorService.getDashboardOverview(userId);
  }

  @Get('analytics/audience')
  @ApiOperation({ summary: 'Get audience demographics and top follower locations' })
  @ApiResponse({ status: 200, description: 'Audience demographics returned' })
  getAudienceDemographics(@CurrentUser('id') userId: string) {
    return this.creatorService.getAudienceDemographics(userId);
  }

  @Get('analytics/content')
  @ApiOperation({ summary: 'Get top performing content and best posting hours' })
  @ApiResponse({ status: 200, description: 'Content performance returned' })
  getContentPerformance(@CurrentUser('id') userId: string) {
    return this.creatorService.getContentPerformance(userId);
  }

  @Get('analytics/growth')
  @ApiOperation({ summary: 'Get follower growth trends over the last 30 days' })
  @ApiResponse({ status: 200, description: 'Growth trends returned' })
  getGrowthTrends(@CurrentUser('id') userId: string) {
    return this.creatorService.getGrowthTrends(userId);
  }

  @Get('analytics/revenue')
  @ApiOperation({ summary: 'Get revenue summary from tips and memberships' })
  @ApiResponse({ status: 200, description: 'Revenue summary returned' })
  getRevenueSummary(@CurrentUser('id') userId: string) {
    return this.creatorService.getRevenueSummary(userId);
  }

  @Post('ask')
  @Throttle({ default: { ttl: 3600000, limit: 20 } })
  @ApiOperation({ summary: 'AI analytics chat — ask about your performance (20/hour)' })
  askAI(
    @CurrentUser('id') userId: string,
    @Body() body: AskAIDto,
  ) {
    return this.creatorService.askAI(userId, body.question);
  }
}

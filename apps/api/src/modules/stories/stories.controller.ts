import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StoriesService } from './stories.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Stories (Saf)')
@Controller('stories')
export class StoriesController {
  constructor(private storiesService: StoriesService) {}

  @Get('feed')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  getFeedStories(@CurrentUser('id') userId: string) {
    return this.storiesService.getFeedStories(userId);
  }

  @Post()
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  create(
    @CurrentUser('id') userId: string,
    @Body('mediaUrl') mediaUrl: string,
    @Body('type') type: string,
    @Body('duration') duration?: number,
    @Body('circleId') circleId?: string,
  ) {
    return this.storiesService.create(userId, mediaUrl, type, duration, circleId);
  }

  @Post(':id/view')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  markViewed(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.storiesService.markViewed(id, userId);
  }
}

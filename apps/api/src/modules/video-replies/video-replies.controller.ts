import { Throttle } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VideoRepliesService } from './video-replies.service';

@ApiTags('video-replies')
@ApiBearerAuth()
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('video-replies')
export class VideoRepliesController {
  constructor(private readonly videoRepliesService: VideoRepliesService) {}

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create a video reply to a comment' })
  create(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      commentId: string;
      commentType: 'POST' | 'REEL';
      mediaUrl: string;
      thumbnailUrl?: string;
      duration?: number;
    },
  ) {
    return this.videoRepliesService.create(userId, body);
  }

  @Get('comment/:commentId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get video replies for a comment' })
  getByComment(
    @Param('commentId') commentId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.videoRepliesService.getByComment(commentId, cursor);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get a video reply by ID' })
  getById(@Param('id') id: string) {
    return this.videoRepliesService.getById(id);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Delete a video reply' })
  delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.videoRepliesService.delete(id, userId);
  }
}

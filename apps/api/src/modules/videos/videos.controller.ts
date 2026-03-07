import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { CreateVideoCommentDto } from './dto/create-video-comment.dto';

@ApiTags('Videos (Minbar)')
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post()
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a video' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateVideoDto,
  ) {
    return this.videosService.create(userId, dto);
  }

  @Get('feed')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get video feed (subscriptions + trending)' })
  getFeed(
    @CurrentUser('id') userId?: string,
    @Query('category') category?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.videosService.getFeed(userId, category, cursor);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get video by ID' })
  getById(
    @Param('id') id: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.videosService.getById(id, userId);
  }

  @Patch(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update video details' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateVideoDto,
  ) {
    return this.videosService.update(id, userId, dto);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a video' })
  delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.videosService.delete(id, userId);
  }

  @Post(':id/like')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like a video' })
  like(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.videosService.like(id, userId);
  }

  @Post(':id/dislike')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dislike a video' })
  dislike(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.videosService.dislike(id, userId);
  }

  @Delete(':id/reaction')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove reaction from a video' })
  removeReaction(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.videosService.removeReaction(id, userId);
  }

  @Post(':id/comment')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a comment to a video' })
  comment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateVideoCommentDto,
  ) {
    return this.videosService.comment(id, userId, dto.content, dto.parentId);
  }

  @Get(':id/comments')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get video comments (cursor paginated)' })
  getComments(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.videosService.getComments(id, cursor);
  }

  @Post(':id/bookmark')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bookmark a video' })
  bookmark(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.videosService.bookmark(id, userId);
  }

  @Delete(':id/bookmark')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove bookmark from a video' })
  unbookmark(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.videosService.unbookmark(id, userId);
  }

  @Post(':id/view')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Record a view for a video' })
  view(
    @Param('id') id: string,
    @CurrentUser('id') userId?: string,
  ) {
    // Only record view if user is authenticated
    if (userId) {
      return this.videosService.view(id, userId);
    }
    // For anonymous users, just return success without recording
    return { viewed: true };
  }

  @Post(':id/report')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Report a video' })
  report(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('reason') reason: string,
  ) {
    return this.videosService.report(id, userId, reason);
  }
}
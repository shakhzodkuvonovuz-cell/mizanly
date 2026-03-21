import {
  Controller,
  Post,
  Get,
  Put,
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
import { ReportDto } from './dto/report.dto';
import { VideoProgressDto } from './dto/video-progress.dto';
import { SetEndScreensDto } from './dto/end-screen.dto';
import { CreatePremiereDto } from './dto/premiere.dto';

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

  @Get('comments/:commentId/replies')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get replies to a video comment' })
  getCommentReplies(
    @Param('commentId') commentId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.videosService.getCommentReplies(commentId, cursor, limitNum);
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
  @Throttle({ default: { ttl: 60000, limit: 60 } })
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

  @Patch(':id/progress')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update watch progress for a video' })
  updateProgress(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: VideoProgressDto,
  ) {
    return this.videosService.updateProgress(id, userId, dto.progress);
  }

  @Post(':id/report')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Report a video' })
  report(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReportDto,
  ) {
    return this.videosService.report(id, userId, dto.reason);
  }

  @Get(':id/recommended')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get recommended videos based on this video' })
  getRecommended(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @CurrentUser('id') userId?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.videosService.getRecommended(id, limitNum, userId);
  }

  @Post(':id/record-progress')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record watch progress for a video' })
  recordProgress(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: VideoProgressDto,
  ) {
    return this.videosService.recordProgress(id, userId, dto.progress);
  }

  @Get(':id/share-link')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get shareable link for a video' })
  getShareLink(@Param('id') id: string) {
    return this.videosService.getShareLink(id);
  }

  // ── Premiere ──────────────────────────────────────────

  @Post(':id/premiere')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create video premiere' })
  createPremiere(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CreatePremiereDto,
  ) {
    return this.videosService.createPremiere(id, userId, dto);
  }

  @Get(':id/premiere')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get premiere info' })
  getPremiere(@Param('id') id: string) {
    return this.videosService.getPremiere(id);
  }

  @Post(':id/premiere/reminder')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Set premiere reminder' })
  setPremiereReminder(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.videosService.setPremiereReminder(id, userId);
  }

  @Delete(':id/premiere/reminder')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Remove premiere reminder' })
  removePremiereReminder(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.videosService.removePremiereReminder(id, userId);
  }

  @Post(':id/premiere/start')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Start premiere' })
  startPremiere(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.videosService.startPremiere(id, userId);
  }

  @Get(':id/premiere/viewers')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get premiere viewer count' })
  getPremiereViewerCount(@Param('id') id: string) {
    return this.videosService.getPremiereViewerCount(id);
  }

  // ── End Screens ───────────────────────────────────────

  @Put(':id/end-screens')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set end screens for a video (max 4)' })
  setEndScreens(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SetEndScreensDto,
  ) {
    return this.videosService.setEndScreens(id, userId, dto.items);
  }

  @Get(':id/end-screens')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get end screens for a video' })
  getEndScreens(@Param('id') id: string) {
    return this.videosService.getEndScreens(id);
  }

  @Delete(':id/end-screens')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete all end screens for a video' })
  deleteEndScreens(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.videosService.deleteEndScreens(id, userId);
  }
}
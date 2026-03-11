import { Body, Controller, Post, Get, UseGuards, Query, Param, Delete, Patch } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReelsService } from './reels.service';
import { CreateReelDto } from './dto/create-reel.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ReportDto } from './dto/report.dto';

@ApiTags('reels')
@ApiBearerAuth()
@Controller('reels')
@UseGuards(ClerkAuthGuard)
export class ReelsController {
  constructor(private readonly reelsService: ReelsService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a reel' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReelDto,
  ) {
    return this.reelsService.create(userId, dto);
  }

  @Get('feed')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get reels feed' })
  getFeed(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reelsService.getFeed(userId, cursor);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get reel by ID' })
  getById(
    @Param('id') id: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.reelsService.getById(id, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a reel' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reelsService.delete(id, userId);
  }

  @Post(':id/like')
  @ApiOperation({ summary: 'Like a reel' })
  like(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reelsService.like(id, userId);
  }

  @Delete(':id/like')
  @ApiOperation({ summary: 'Unlike a reel' })
  unlike(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reelsService.unlike(id, userId);
  }

  @Post(':id/comment')
  @ApiOperation({ summary: 'Add a comment to a reel' })
  comment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.reelsService.comment(id, userId, dto.content);
  }

  @Get(':id/comments')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get comments for a reel (cursor paginated)' })
  getComments(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reelsService.getComments(id, cursor);
  }

  @Delete(':id/comments/:commentId')
  @ApiOperation({ summary: 'Delete a comment from a reel' })
  deleteComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reelsService.deleteComment(id, commentId, userId);
  }

  @Post(':id/share')
  @ApiOperation({ summary: 'Share a reel' })
  share(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reelsService.share(id, userId);
  }

  @Post(':id/bookmark')
  @ApiOperation({ summary: 'Bookmark a reel' })
  bookmark(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reelsService.bookmark(id, userId);
  }

  @Delete(':id/bookmark')
  @ApiOperation({ summary: 'Remove bookmark from a reel' })
  unbookmark(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reelsService.unbookmark(id, userId);
  }

  @Post(':id/view')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Record a view for a reel' })
  view(@Param('id') id: string, @CurrentUser('id') userId?: string) {
    // Only record view if user is authenticated
    if (userId) {
      return this.reelsService.view(id, userId);
    }
    // For anonymous users, just return success without recording
    return { viewed: true };
  }

  @Get('user/:username')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get reels by username' })
  getUserReels(
    @Param('username') username: string,
    @CurrentUser('id') userId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reelsService.getUserReels(username, cursor, 20, userId);
  }

  @Post(':id/report')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Report a reel' })
  report(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReportDto,
  ) {
    return this.reelsService.report(id, userId, dto.reason);
  }

  @Get('audio/:audioTrackId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get reels using specific audio track' })
  getByAudioTrack(
    @Param('audioTrackId') audioTrackId: string,
    @CurrentUser('id') userId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reelsService.getByAudioTrack(audioTrackId, cursor, 20, userId);
  }

  @Get(':id/duets')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get duets of a reel' })
  getDuets(
    @Param('id') id: string,
    @CurrentUser('id') userId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reelsService.getDuets(id, cursor, 20, userId);
  }

  @Get(':id/stitches')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get stitches of a reel' })
  getStitches(
    @Param('id') id: string,
    @CurrentUser('id') userId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reelsService.getStitches(id, cursor, 20, userId);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive a reel' })
  archive(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reelsService.archive(id, userId);
  }

  @Patch(':id/unarchive')
  @ApiOperation({ summary: 'Unarchive a reel' })
  unarchive(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reelsService.unarchive(id, userId);
  }

  @Get(':id/share-link')
  @ApiOperation({ summary: 'Get shareable link for a reel' })
  getShareLink(
    @Param('id') id: string,
  ) {
    return this.reelsService.getShareLink(id);
  }
}
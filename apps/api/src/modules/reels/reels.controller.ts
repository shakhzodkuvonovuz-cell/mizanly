import { Body, Controller, Post, Get, UseGuards, Query, Param, Delete, Patch } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
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
export class ReelsController {
  constructor(private readonly reelsService: ReelsService) {}

  @Post()
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a reel' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReelDto,
  ) {
    return this.reelsService.create(userId, dto);
  }

  // --- Static GET routes MUST come before :id parameterized routes ---

  @Get('feed')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get reels feed' })
  getFeed(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reelsService.getFeed(userId, cursor);
  }

  @Get('trending')
  @UseGuards(OptionalClerkAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Trending reels scored by completion rate + engagement (anonymous-safe)' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getTrending(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reelsService.getTrendingReels(cursor, limit ? parseInt(limit, 10) : 20);
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

  // --- Parameterized :id routes below ---

  @Patch(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Update reel caption/hashtags' })
  updateReel(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: { caption?: string; hashtags?: string[] },
  ) {
    return this.reelsService.updateReel(id, userId, dto);
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
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Delete a reel' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reelsService.delete(id, userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/like')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Like a reel' })
  like(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reelsService.like(id, userId);
  }

  @Delete(':id/like')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Unlike a reel' })
  unlike(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reelsService.unlike(id, userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/comment')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Add a comment to a reel' })
  comment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.reelsService.comment(id, userId, dto.content, dto.parentId);
  }

  @Get(':id/comments')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get comments for a reel (cursor paginated)' })
  getComments(
    @Param('id') id: string,
    @CurrentUser('id') userId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.reelsService.getComments(id, userId, cursor);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/comments/:commentId/like')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Like a reel comment' })
  likeComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reelsService.likeComment(id, commentId, userId);
  }

  @Delete(':id/comments/:commentId/like')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Unlike a reel comment' })
  unlikeComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reelsService.unlikeComment(id, commentId, userId);
  }

  @Delete(':id/comments/:commentId')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Delete a comment from a reel' })
  deleteComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reelsService.deleteComment(id, commentId, userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/share')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Share a reel' })
  share(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reelsService.share(id, userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/bookmark')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Bookmark a reel' })
  bookmark(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reelsService.bookmark(id, userId);
  }

  @Delete(':id/bookmark')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Remove bookmark from a reel' })
  unbookmark(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.reelsService.unbookmark(id, userId);
  }

  @Post(':id/view')
  @UseGuards(OptionalClerkAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Record a view for a reel' })
  view(@Param('id') id: string, @CurrentUser('id') userId?: string) {
    // Only record view if user is authenticated
    if (userId) {
      return this.reelsService.view(id, userId);
    }
    // For anonymous users, just return success without recording
    return { viewed: true };
  }

  @Post(':id/report')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Report a reel' })
  report(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReportDto,
  ) {
    return this.reelsService.report(id, userId, dto.reason);
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
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Archive a reel' })
  archive(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reelsService.archive(id, userId);
  }

  @Patch(':id/publish-trial')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Publish a trial reel to all followers' })
  publishTrial(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reelsService.publishTrial(id, userId);
  }

  @Patch(':id/unarchive')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Unarchive a reel' })
  unarchive(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reelsService.unarchive(id, userId);
  }

  @Get(':id/share-link')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get shareable link for a reel' })
  getShareLink(
    @Param('id') id: string,
  ) {
    return this.reelsService.getShareLink(id);
  }
}

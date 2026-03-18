import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ThreadsService } from './threads.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { ReportDto } from './dto/report.dto';
import { AddReplyDto } from './dto/add-reply.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';


@ApiTags('Threads (Majlis)')
@Controller('threads')
export class ThreadsController {
  constructor(private threadsService: ThreadsService) {}

  // --- Static routes MUST be above :id param routes ---

  @Get('feed')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get thread feed (foryou | following | trending)' })
  getFeed(
    @CurrentUser('id') userId: string,
    @Query('type') type?: 'foryou' | 'following' | 'trending',
    @Query('cursor') cursor?: string,
  ) {
    return this.threadsService.getFeed(userId, type ?? 'foryou', cursor);
  }

  @Get('user/:username')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: "Get user's threads by username" })
  getUserThreads(
    @Param('username') username: string,
    @Query('cursor') cursor?: string,
    @CurrentUser('id') viewerId?: string,
  ) {
    return this.threadsService.getUserThreads(username, cursor, 20, viewerId);
  }

  @Post('polls/:optionId/vote')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vote on a poll option' })
  votePoll(
    @Param('optionId') optionId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.threadsService.votePoll(optionId, userId);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a thread' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateThreadDto) {
    return this.threadsService.create(userId, dto);
  }

  // --- Param routes below ---

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get thread by ID' })
  getById(@Param('id') id: string, @CurrentUser('id') viewerId?: string) {
    return this.threadsService.getById(id, viewerId);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a thread' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.threadsService.delete(id, userId);
  }

  @Post(':id/like')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like a thread' })
  like(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.threadsService.like(id, userId);
  }

  @Delete(':id/like')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlike a thread' })
  unlike(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.threadsService.unlike(id, userId);
  }

  @Post(':id/repost')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Repost a thread' })
  repost(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.threadsService.repost(id, userId);
  }

  @Delete(':id/repost')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove repost' })
  unrepost(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.threadsService.unrepost(id, userId);
  }

  @Post(':id/bookmark')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bookmark a thread' })
  bookmark(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.threadsService.bookmark(id, userId);
  }

  @Delete(':id/bookmark')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove bookmark' })
  unbookmark(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.threadsService.unbookmark(id, userId);
  }

  @Get(':id/replies')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get replies to a thread' })
  getReplies(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @CurrentUser('id') viewerId?: string,
  ) {
    return this.threadsService.getReplies(id, cursor, 20, viewerId);
  }

  @Post(':id/replies/:replyId/like')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like a thread reply' })
  likeReply(
    @Param('id') threadId: string,
    @Param('replyId') replyId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.threadsService.likeReply(threadId, replyId, userId);
  }

  @Delete(':id/replies/:replyId/like')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlike a thread reply' })
  unlikeReply(
    @Param('id') threadId: string,
    @Param('replyId') replyId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.threadsService.unlikeReply(threadId, replyId, userId);
  }

  @Post(':id/replies')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a reply to a thread' })
  addReply(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddReplyDto,
  ) {
    return this.threadsService.addReply(id, userId, dto.content, dto.parentId);
  }

  @Delete(':id/replies/:replyId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a reply' })
  deleteReply(
    @Param('replyId') replyId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.threadsService.deleteReply(replyId, userId);
  }

  @Post(':id/report')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report a thread' })
  report(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReportDto,
  ) {
    return this.threadsService.report(id, userId, dto.reason);
  }

  @Post(':id/dismiss')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss a thread from feed (not interested)' })
  dismiss(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.threadsService.dismiss(id, userId);
  }

  @Put(':id/reply-permission')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set who can reply to this thread' })
  setReplyPermission(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('permission') permission: 'everyone' | 'following' | 'mentioned' | 'none',
  ) {
    return this.threadsService.setReplyPermission(id, userId, permission);
  }

  @Get(':id/can-reply')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Check if current user can reply to this thread' })
  canReply(
    @Param('id') id: string,
    @CurrentUser('id') viewerId?: string,
  ) {
    return this.threadsService.canReply(id, viewerId);
  }

  @Get(':id/share-link')
  @ApiOperation({ summary: 'Get shareable URL for this thread' })
  getShareLink(@Param('id') id: string) {
    return this.threadsService.getShareLink(id);
  }

  @Get(':id/bookmarked')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if current user has bookmarked this thread' })
  isBookmarked(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.threadsService.isBookmarked(id, userId);
  }
}

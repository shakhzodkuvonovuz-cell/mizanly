import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, MaxLength, IsOptional } from 'class-validator';
import { ThreadsService } from './threads.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class AddReplyDto {
  @IsString()
  @MaxLength(500)
  content: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

@ApiTags('Threads (Majlis)')
@Controller('threads')
export class ThreadsController {
  constructor(private threadsService: ThreadsService) {}

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

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a thread' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateThreadDto) {
    return this.threadsService.create(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get thread by ID' })
  getById(@Param('id') id: string, @Query('viewerId') viewerId?: string) {
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
  @ApiOperation({ summary: 'Get replies to a thread' })
  getReplies(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.threadsService.getReplies(id, cursor);
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

  @Get('user/:username')
  @ApiOperation({ summary: "Get user's threads by username" })
  getUserThreads(
    @Param('username') username: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.threadsService.getUserThreads(username, cursor);
  }
}

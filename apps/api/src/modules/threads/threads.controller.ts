import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ThreadsService } from './threads.service';
import { CreateThreadDto } from './dto/create-thread.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Threads (Majlis)')
@Controller('threads')
export class ThreadsController {
  constructor(private threadsService: ThreadsService) {}

  @Get('feed')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  getFeed(@CurrentUser('id') userId: string, @Query('type') type?: string, @Query('cursor') cursor?: string) {
    return this.threadsService.getFeed(userId, type as any, cursor);
  }

  @Post()
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateThreadDto) {
    return this.threadsService.create(userId, dto);
  }

  @Get(':id')
  getById(@Param('id') id: string) { return this.threadsService.getById(id); }

  @Get(':id/replies')
  getReplies(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.threadsService.getReplies(id, cursor);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.threadsService.delete(id, userId);
  }

  @Post(':id/like')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  like(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.threadsService.like(id, userId); }

  @Delete(':id/like')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  unlike(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.threadsService.unlike(id, userId); }

  @Post(':id/repost')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  repost(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.threadsService.repost(id, userId); }

  @Post('polls/:optionId/vote')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  votePoll(@Param('optionId') optionId: string, @CurrentUser('id') userId: string) {
    return this.threadsService.votePoll(optionId, userId);
  }
}

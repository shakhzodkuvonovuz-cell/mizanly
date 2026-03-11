import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BookmarksService } from './bookmarks.service';
import { SavePostDto, MoveCollectionDto } from './dto/bookmark.dto';

@ApiTags('Bookmarks')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('api/v1/bookmarks')
export class BookmarksController {
  constructor(private service: BookmarksService) {}

  // POST /bookmarks/posts
  @Post('posts')
  @ApiOperation({ summary: 'Save a post' })
  savePost(@CurrentUser('id') userId: string, @Body() dto: SavePostDto) {
    return this.service.savePost(userId, dto.postId, dto.collectionName);
  }

  // DELETE /bookmarks/posts/:postId
  @Delete('posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unsave a post' })
  unsavePost(@CurrentUser('id') userId: string, @Param('postId') postId: string) {
    return this.service.unsavePost(userId, postId);
  }

  // POST /bookmarks/threads/:threadId
  @Post('threads/:threadId')
  @ApiOperation({ summary: 'Save a thread' })
  saveThread(@CurrentUser('id') userId: string, @Param('threadId') threadId: string) {
    return this.service.saveThread(userId, threadId);
  }

  // DELETE /bookmarks/threads/:threadId
  @Delete('threads/:threadId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unsave a thread' })
  unsaveThread(@CurrentUser('id') userId: string, @Param('threadId') threadId: string) {
    return this.service.unsaveThread(userId, threadId);
  }

  // POST /bookmarks/videos/:videoId
  @Post('videos/:videoId')
  @ApiOperation({ summary: 'Save a video' })
  saveVideo(@CurrentUser('id') userId: string, @Param('videoId') videoId: string) {
    return this.service.saveVideo(userId, videoId);
  }

  // DELETE /bookmarks/videos/:videoId
  @Delete('videos/:videoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unsave a video' })
  unsaveVideo(@CurrentUser('id') userId: string, @Param('videoId') videoId: string) {
    return this.service.unsaveVideo(userId, videoId);
  }

  // GET /bookmarks/posts
  @Get('posts')
  @ApiOperation({ summary: 'Get saved posts' })
  getSavedPosts(
    @CurrentUser('id') userId: string,
    @Query('collection') collectionName?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.service.getSavedPosts(userId, collectionName, cursor, limit);
  }

  // GET /bookmarks/threads
  @Get('threads')
  @ApiOperation({ summary: 'Get saved threads' })
  getSavedThreads(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.service.getSavedThreads(userId, cursor, limit);
  }

  // GET /bookmarks/videos
  @Get('videos')
  @ApiOperation({ summary: 'Get saved videos' })
  getSavedVideos(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.service.getSavedVideos(userId, cursor, limit);
  }

  // GET /bookmarks/collections
  @Get('collections')
  @ApiOperation({ summary: 'Get collections' })
  getCollections(@CurrentUser('id') userId: string) {
    return this.service.getCollections(userId);
  }

  // PATCH /bookmarks/posts/:postId/move
  @Patch('posts/:postId/move')
  @ApiOperation({ summary: 'Move saved post to another collection' })
  moveToCollection(
    @CurrentUser('id') userId: string,
    @Param('postId') postId: string,
    @Body() dto: MoveCollectionDto,
  ) {
    return this.service.moveToCollection(userId, postId, dto.collectionName);
  }

  // GET /bookmarks/posts/:postId/status
  @Get('posts/:postId/status')
  @ApiOperation({ summary: 'Check if post is saved' })
  isPostSaved(@CurrentUser('id') userId: string, @Param('postId') postId: string) {
    return this.service.isPostSaved(userId, postId);
  }

  // GET /bookmarks/threads/:threadId/status
  @Get('threads/:threadId/status')
  @ApiOperation({ summary: 'Check if thread is saved' })
  isThreadSaved(@CurrentUser('id') userId: string, @Param('threadId') threadId: string) {
    return this.service.isThreadSaved(userId, threadId);
  }

  // GET /bookmarks/videos/:videoId/status
  @Get('videos/:videoId/status')
  @ApiOperation({ summary: 'Check if video is saved' })
  isVideoSaved(@CurrentUser('id') userId: string, @Param('videoId') videoId: string) {
    return this.service.isVideoSaved(userId, videoId);
  }
}
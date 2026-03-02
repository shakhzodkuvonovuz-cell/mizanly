import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Posts (Saf)')
@Controller('posts')
export class PostsController {
  constructor(private postsService: PostsService) {}

  @Get('feed')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  getFeed(
    @CurrentUser('id') userId: string,
    @Query('type') type: 'following' | 'foryou' = 'following',
    @Query('cursor') cursor?: string,
  ) {
    return this.postsService.getFeed(userId, type, cursor);
  }

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePostDto) {
    return this.postsService.create(userId, dto);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.postsService.getById(id);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postsService.delete(id, userId);
  }

  @Post(':id/like')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  like(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postsService.like(id, userId);
  }

  @Delete(':id/like')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  unlike(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postsService.unlike(id, userId);
  }

  @Post(':id/bookmark')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  bookmark(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postsService.bookmark(id, userId);
  }

  @Delete(':id/bookmark')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  unbookmark(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postsService.unbookmark(id, userId);
  }

  @Get(':id/comments')
  getComments(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.postsService.getComments(id, cursor);
  }

  @Post(':id/comments')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  addComment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('content') content: string,
    @Body('parentId') parentId?: string,
  ) {
    return this.postsService.addComment(id, userId, content, parentId);
  }
}

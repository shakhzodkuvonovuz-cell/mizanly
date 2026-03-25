import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { ReportDto } from './dto/report.dto';
import { CrossPostDto } from './dto/cross-post.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class ReactDto {
  @IsEnum(['LIKE', 'LOVE', 'SUPPORT', 'INSIGHTFUL'])
  reaction: string;
}

class EditCommentDto {
  @IsString()
  @MaxLength(1000)
  content: string;
}

class RespondToTagDto {
  @IsEnum(['APPROVED', 'DECLINED'])
  status: 'APPROVED' | 'DECLINED';
}

class ShareDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;
}

class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;
}

@ApiTags('Posts (Saf)')
@Controller('posts')
export class PostsController {
  constructor(private postsService: PostsService) {}

  @Get('feed')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get paginated feed (following | foryou | chronological | favorites). Supports anonymous browsing.' })
  getFeed(
    @CurrentUser('id') userId: string | undefined,
    @Query('type') type: 'following' | 'foryou' | 'chronological' | 'favorites' = 'following',
    @Query('cursor') cursor?: string,
  ) {
    return this.postsService.getFeed(userId ?? '', type, cursor);
  }

  @Get('archived')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get archived posts (cursor paginated)' })
  getArchived(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.postsService.getArchived(userId, cursor);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a post' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePostDto) {
    return this.postsService.create(userId, dto);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get post by ID' })
  getById(
    @Param('id') id: string,
    // viewerId is taken from the verified auth context, not from query params
    @CurrentUser('id') viewerId?: string,
  ) {
    return this.postsService.getById(id, viewerId);
  }

  @Patch(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit post content' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.update(id, userId, dto);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete (soft-remove) a post' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postsService.delete(id, userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/react')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'React to a post (LIKE | LOVE | SUPPORT | INSIGHTFUL)' })
  react(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReactDto,
  ) {
    return this.postsService.react(id, userId, dto.reaction);
  }

  @Delete(':id/react')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove reaction from a post' })
  unreact(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postsService.unreact(id, userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/save')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save / bookmark a post' })
  save(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postsService.save(id, userId);
  }

  @Delete(':id/save')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unsave a post' })
  unsave(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postsService.unsave(id, userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/share')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Share / repost a post' })
  share(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ShareDto,
  ) {
    return this.postsService.share(id, userId, dto.content);
  }

  @Get(':id/comments')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get top-level comments (cursor paginated)' })
  getComments(@Param('id') id: string, @Query('cursor') cursor?: string) {
    return this.postsService.getComments(id, cursor);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/comments')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a comment' })
  addComment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddCommentDto,
  ) {
    return this.postsService.addComment(id, userId, dto);
  }

  @Get(':id/comments/hidden')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get hidden comments on your post (author only)' })
  getHiddenComments(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.postsService.getHiddenComments(id, userId, cursor);
  }

  @Get(':id/comments/:commentId/replies')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get replies to a comment' })
  getCommentReplies(
    @Param('commentId') commentId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.postsService.getCommentReplies(commentId, cursor);
  }

  @Patch(':id/comments/:commentId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit a comment' })
  editComment(
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: EditCommentDto,
  ) {
    return this.postsService.editComment(commentId, userId, dto.content);
  }

  @Delete(':id/comments/:commentId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a comment' })
  deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.deleteComment(commentId, userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/comments/:commentId/like')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like a comment' })
  likeComment(
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.likeComment(commentId, userId);
  }

  @Delete(':id/comments/:commentId/like')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlike a comment' })
  unlikeComment(
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.unlikeComment(commentId, userId);
  }

  @Post(':id/report')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report a post' })
  report(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReportDto,
  ) {
    return this.postsService.report(id, userId, dto.reason);
  }

  @Post(':id/dismiss')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss a post from feed (not interested)' })
  dismiss(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.dismiss(id, userId);
  }

  @Post(':id/archive')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a post' })
  archive(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postsService.archivePost(id, userId);
  }

  @Delete(':id/archive')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unarchive a post' })
  unarchive(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.postsService.unarchivePost(id, userId);
  }

  @Post(':id/comments/:commentId/pin')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pin a comment on a post' })
  pinComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.pinComment(id, commentId, userId);
  }

  @Delete(':id/comments/:commentId/pin')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpin a comment' })
  unpinComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.unpinComment(id, commentId, userId);
  }

  // ── Hide Reply ──
  @Post(':id/comments/:commentId/hide')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hide a comment on your post (author only)' })
  hideComment(
    @Param('id') _postId: string,
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.hideComment(commentId, userId);
  }

  @Delete(':id/comments/:commentId/hide')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unhide a comment on your post (author only)' })
  unhideComment(
    @Param('id') _postId: string,
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.unhideComment(commentId, userId);
  }

  @Get(':id/share-link')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get shareable link for a post' })
  getShareLink(@Param('id') id: string) {
    return this.postsService.getShareLink(id);
  }

  @Post(':id/share-as-story')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Share a post as a story' })
  shareAsStory(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.postsService.shareAsStory(id, userId);
  }

  @Post(':id/cross-post')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Cross-post to other spaces (Saf, Majlis, Bakra, Minbar)' })
  crossPost(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CrossPostDto,
  ) {
    return this.postsService.crossPost(userId, id, dto);
  }

  @Patch('tags/:tagId/respond')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Approve or decline a tag (tagged user responds)' })
  respondToTag(
    @Param('tagId') tagId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RespondToTagDto,
  ) {
    return this.postsService.respondToTag(tagId, userId, dto.status);
  }
}

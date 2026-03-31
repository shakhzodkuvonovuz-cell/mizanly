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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { CreateHighlightDto } from './dto/create-highlight.dto';
import { UpdateHighlightDto } from './dto/update-highlight.dto';
import { IsString, IsObject, MaxLength, MinLength } from 'class-validator';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class StoryReplyDto {
  @IsString() @MaxLength(2000) content: string;
}

class StickerResponseDto {
  @IsString() @MaxLength(50) stickerType: string;
  @IsObject() responseData: Record<string, unknown>;
}

class ReportStoryDto {
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

@ApiTags('Stories (Saf)')
@Controller('stories')
export class StoriesController {
  constructor(private storiesService: StoriesService) {}

  @Get('feed')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stories feed (grouped by user)' })
  getFeed(@CurrentUser('id') userId: string) {
    return this.storiesService.getFeedStories(userId);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a story' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateStoryDto) {
    return this.storiesService.create(userId, dto);
  }

  @Get('highlights/:userId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: "Get user's highlight albums" })
  getHighlights(@Param('userId') userId: string) {
    return this.storiesService.getHighlights(userId);
  }

  @Get('me/archived')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get archived stories for current user' })
  getArchived(@CurrentUser('id') userId: string) {
    return this.storiesService.getArchived(userId);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get story by ID' })
  getById(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.storiesService.getById(id, userId);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete (archive) a story' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.storiesService.delete(id, userId);
  }

  @Patch(':id/unarchive')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unarchive a story' })
  unarchive(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.storiesService.unarchive(id, userId);
  }

  @Post(':id/view')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Mark story as viewed' })
  markViewed(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.storiesService.markViewed(id, userId);
  }

  @Get(':id/viewers')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get story viewers (own stories only)' })
  getViewers(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.storiesService.getViewers(id, userId, cursor);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/reply')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reply to a story (creates DM)' })
  replyToStory(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: StoryReplyDto,
  ) {
    return this.storiesService.replyToStory(id, userId, dto.content);
  }

  @Get(':id/reaction-summary')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get story emoji reaction summary (owner only)' })
  getReactionSummary(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.storiesService.getReactionSummary(id, userId);
  }

  @Post('highlights')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a highlight album' })
  createHighlight(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateHighlightDto,
  ) {
    return this.storiesService.createHighlight(userId, dto.title, dto.coverUrl);
  }

  @Patch('highlights/:albumId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Update highlight album' })
  updateHighlight(
    @Param('albumId') albumId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateHighlightDto,
  ) {
    return this.storiesService.updateHighlight(albumId, userId, dto);
  }

  @Delete('highlights/:albumId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a highlight album' })
  deleteHighlight(
    @Param('albumId') albumId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.storiesService.deleteHighlight(albumId, userId);
  }

  @Post('highlights/:albumId/stories/:storyId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Add story to highlight album' })
  addToHighlight(
    @Param('albumId') albumId: string,
    @Param('storyId') storyId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.storiesService.addStoryToHighlight(storyId, albumId, userId);
  }

  @Post(':id/report')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report a story' })
  reportStory(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReportStoryDto,
  ) {
    return this.storiesService.reportStory(id, userId, dto.reason);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/sticker-response')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth() @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit sticker response' })
  async submitStickerResponse(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: StickerResponseDto) {
    return this.storiesService.submitStickerResponse(id, userId, dto.stickerType, dto.responseData);
  }

  @Get(':id/sticker-responses')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Get sticker responses' })
  async getStickerResponses(@Param('id') id: string, @CurrentUser('id') userId: string, @Query('type') type?: string) {
    return this.storiesService.getStickerResponses(id, userId, type);
  }

  @Get(':id/sticker-summary')
  @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Get sticker summary' })
  async getStickerSummary(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.storiesService.getStickerSummary(id, userId);
  }
}

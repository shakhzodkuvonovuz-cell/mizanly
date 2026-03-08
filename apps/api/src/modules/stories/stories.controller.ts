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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsOptional, IsBoolean, IsUrl, IsObject, IsNumber, MaxLength } from 'class-validator';
import { StoriesService } from './stories.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class CreateStoryDto {
  @ApiProperty({ description: 'URL of the story media' })
  @IsUrl()
  mediaUrl: string;

  @ApiProperty({ description: 'Media type (e.g., IMAGE, VIDEO)', maxLength: 20 })
  @IsString()
  @MaxLength(20)
  mediaType: string;

  @ApiProperty({ required: false, description: 'Thumbnail URL for video stories' })
  @IsOptional()
  @IsUrl()
  thumbnailUrl?: string;

  @ApiProperty({ required: false, description: 'Duration in seconds for video stories' })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiProperty({ required: false, description: 'Text overlay content', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  textOverlay?: string;

  @ApiProperty({ required: false, description: 'Text color hex code', maxLength: 7 })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  textColor?: string;

  @ApiProperty({ required: false, description: 'Background color hex code', maxLength: 7 })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  bgColor?: string;

  @ApiProperty({ required: false, description: 'Sticker data as JSON object' })
  @IsOptional()
  @IsObject()
  stickerData?: object;

  @ApiProperty({ required: false, description: 'Whether story is for close friends only' })
  @IsOptional()
  @IsBoolean()
  closeFriendsOnly?: boolean;
}

class CreateHighlightDto {
  @ApiProperty({ description: 'Highlight album title', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  title: string;

  @ApiProperty({ required: false, description: 'Cover image URL for the highlight album' })
  @IsOptional()
  @IsUrl()
  coverUrl?: string;
}

class UpdateHighlightDto {
  @ApiProperty({ required: false, description: 'Highlight album title', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  title?: string;

  @ApiProperty({ required: false, description: 'Cover image URL for the highlight album' })
  @IsOptional()
  @IsUrl()
  coverUrl?: string;
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

  @Get(':id')
  @ApiOperation({ summary: 'Get story by ID' })
  getById(@Param('id') id: string) {
    return this.storiesService.getById(id);
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

  @Get('highlights/:userId')
  @ApiOperation({ summary: "Get user's highlight albums" })
  getHighlights(@Param('userId') userId: string) {
    return this.storiesService.getHighlights(userId);
  }

  @Post('highlights')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a highlight album' })
  deleteHighlight(
    @Param('albumId') albumId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.storiesService.deleteHighlight(albumId, userId);
  }

  @Get('me/archived')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get archived stories for current user' })
  getArchived(@CurrentUser('id') userId: string) {
    return this.storiesService.getArchived(userId);
  }

  @Post('highlights/:albumId/stories/:storyId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add story to highlight album' })
  addToHighlight(
    @Param('albumId') albumId: string,
    @Param('storyId') storyId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.storiesService.addStoryToHighlight(storyId, albumId, userId);
  }
}

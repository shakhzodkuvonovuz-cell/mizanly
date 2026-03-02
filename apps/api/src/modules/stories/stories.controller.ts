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
import { IsString, IsOptional, IsBoolean, IsUrl, IsObject } from 'class-validator';
import { StoriesService } from './stories.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class CreateStoryDto {
  @IsUrl()
  mediaUrl: string;

  @IsString()
  mediaType: string;

  @IsOptional() @IsUrl() thumbnailUrl?: string;
  @IsOptional() duration?: number;
  @IsOptional() @IsString() textOverlay?: string;
  @IsOptional() @IsString() textColor?: string;
  @IsOptional() @IsString() bgColor?: string;
  @IsOptional() @IsObject() stickerData?: object;
  @IsOptional() @IsBoolean() closeFriendsOnly?: boolean;
}

class CreateHighlightDto {
  @IsString() title: string;
  @IsOptional() @IsUrl() coverUrl?: string;
}

class UpdateHighlightDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsUrl() coverUrl?: string;
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

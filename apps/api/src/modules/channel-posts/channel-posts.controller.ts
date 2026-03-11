import { Controller, Get, Post, Delete, Patch, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChannelPostsService } from './channel-posts.service';
import { CreateChannelPostDto } from './dto/create-channel-post.dto';

@ApiTags('Channel Community Posts')
@Controller('channel-posts')
export class ChannelPostsController {
  constructor(private channelPosts: ChannelPostsService) {}

  @Post(':channelId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create community post' })
  async create(@Param('channelId') channelId: string, @CurrentUser('id') userId: string, @Body() dto: CreateChannelPostDto) {
    return this.channelPosts.create(channelId, userId, dto);
  }

  @Get('channel/:channelId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get channel community feed' })
  async getFeed(@Param('channelId') channelId: string, @Query('cursor') cursor?: string) {
    return this.channelPosts.getFeed(channelId, cursor);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get community post' })
  async getById(@Param('id') id: string) {
    return this.channelPosts.getById(id);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete community post' })
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.channelPosts.delete(id, userId);
  }

  @Patch(':id/pin')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pin post' })
  async pin(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.channelPosts.pin(id, userId);
  }

  @Delete(':id/pin')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpin post' })
  async unpin(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.channelPosts.unpin(id, userId);
  }

  @Post(':id/like')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Like post' })
  async like(@Param('id') id: string) {
    return this.channelPosts.like(id);
  }

  @Delete(':id/like')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlike post' })
  async unlike(@Param('id') id: string) {
    return this.channelPosts.unlike(id);
  }
}
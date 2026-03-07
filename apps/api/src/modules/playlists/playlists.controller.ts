import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlaylistsService } from './playlists.service';
import { CreatePlaylistDto } from './dto/create-playlist.dto';
import { UpdatePlaylistDto } from './dto/update-playlist.dto';

@ApiTags('Playlists (Minbar)')
@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly playlistsService: PlaylistsService) {}

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a playlist' })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePlaylistDto,
  ) {
    return this.playlistsService.create(userId, dto);
  }

  @Get('channel/:channelId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get playlists by channel' })
  getByChannel(
    @Param('channelId') channelId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.playlistsService.getByChannel(channelId, cursor);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get playlist by ID' })
  getById(@Param('id') id: string) {
    return this.playlistsService.getById(id);
  }

  @Get(':id/items')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get playlist items (cursor paginated)' })
  getItems(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.playlistsService.getItems(id, cursor);
  }

  @Patch(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update playlist details' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePlaylistDto,
  ) {
    return this.playlistsService.update(id, userId, dto);
  }

  @Delete(':id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a playlist' })
  delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.playlistsService.delete(id, userId);
  }

  @Post(':id/items/:videoId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a video to a playlist' })
  addItem(
    @Param('id') id: string,
    @Param('videoId') videoId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.playlistsService.addItem(id, videoId, userId);
  }

  @Delete(':id/items/:videoId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a video from a playlist' })
  removeItem(
    @Param('id') id: string,
    @Param('videoId') videoId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.playlistsService.removeItem(id, videoId, userId);
  }
}
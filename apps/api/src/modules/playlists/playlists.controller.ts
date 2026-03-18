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
import { AddCollaboratorDto, UpdateCollaboratorDto } from './dto/collaborator.dto';

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

  // Static / compound routes BEFORE parameterized :id routes
  @Get('channel/:channelId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get playlists by channel' })
  getByChannel(
    @Param('channelId') channelId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.playlistsService.getByChannel(channelId, cursor);
  }

  // Compound :id sub-routes before simple :id
  @Get(':id/items')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get playlist items (cursor paginated)' })
  getItems(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.playlistsService.getItems(id, cursor);
  }

  @Get(':id/collaborators')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'List collaborators of a playlist' })
  getCollaborators(@Param('id') id: string) {
    return this.playlistsService.getCollaborators(id);
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

  @Post(':id/collaborative')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle collaborative mode on a playlist' })
  toggleCollaborative(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.playlistsService.toggleCollaborative(id, userId);
  }

  @Post(':id/collaborators')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a collaborator to a playlist' })
  addCollaborator(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddCollaboratorDto,
  ) {
    return this.playlistsService.addCollaborator(id, userId, dto);
  }

  @Delete(':id/collaborators/:userId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a collaborator from a playlist' })
  removeCollaborator(
    @Param('id') id: string,
    @CurrentUser('id') currentUserId: string,
    @Param('userId') collaboratorUserId: string,
  ) {
    return this.playlistsService.removeCollaborator(id, currentUserId, collaboratorUserId);
  }

  @Patch(':id/collaborators/:userId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update collaborator role' })
  updateCollaboratorRole(
    @Param('id') id: string,
    @CurrentUser('id') currentUserId: string,
    @Param('userId') collaboratorUserId: string,
    @Body() dto: UpdateCollaboratorDto,
  ) {
    return this.playlistsService.updateCollaboratorRole(id, currentUserId, collaboratorUserId, dto.role);
  }

  // Simple :id routes LAST
  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get playlist by ID' })
  getById(@Param('id') id: string) {
    return this.playlistsService.getById(id);
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
}

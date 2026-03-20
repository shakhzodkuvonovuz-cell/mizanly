import { Throttle } from '@nestjs/throttler';
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AudioTracksService } from './audio-tracks.service';
import { CreateAudioTrackDto } from './dto/create-audio-track.dto';

@ApiTags('Audio Tracks')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('audio-tracks')
export class AudioTracksController {
  constructor(private audioTracks: AudioTracksService) {}

  @Post() @UseGuards(ClerkAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Create audio track' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAudioTrackDto,
  ) { return this.audioTracks.create(userId, dto); }

  // Static routes MUST be above :id wildcard
  @Get('trending') @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Trending tracks' })
  async trending() { return this.audioTracks.trending(); }

  @Get('search') @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Search tracks' })
  async search(@Query('q') q: string) { return this.audioTracks.search(q); }

  // Wildcard routes below static ones
  @Get(':id') @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get track' })
  async getById(@Param('id') id: string) { return this.audioTracks.getById(id); }

  @Get(':id/reels') @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Reels using track' })
  async reels(@Param('id') id: string, @Query('cursor') cursor?: string) { return this.audioTracks.getReelsUsingTrack(id, cursor); }

  @Delete(':id') @UseGuards(ClerkAuthGuard) @ApiBearerAuth() @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete track (creator only)' })
  async delete(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) { return this.audioTracks.delete(id, userId); }
}
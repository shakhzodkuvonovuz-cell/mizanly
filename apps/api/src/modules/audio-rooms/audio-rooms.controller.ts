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
import { IsString, IsUrl, IsOptional } from 'class-validator';
import { AudioRoomsService } from './audio-rooms.service';
import { CreateAudioRoomDto } from './dto/create-audio-room.dto';
import { RoleChangeDto, AudioRoomRole } from './dto/role-change.dto';
import { MuteToggleDto } from './dto/mute-toggle.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class StopRecordingDto {
  @IsOptional() @IsUrl() recordingUrl?: string;
}

@ApiTags('Audio Rooms')
@Controller('audio-rooms')
export class AudioRoomsController {
  constructor(private audioRoomsService: AudioRoomsService) {}

  // ── Static routes before :id ──

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create audio room' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateAudioRoomDto) {
    return this.audioRoomsService.create(userId, dto);
  }

  @Get()
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'List active audio rooms' })
  list(
    @CurrentUser('id') viewerId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audioRoomsService.list(viewerId, cursor, limit ? parseInt(limit, 10) : 20);
  }

  @Get('active')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get active rooms with participant counts' })
  getActiveRooms(@Query('cursor') cursor?: string) {
    return this.audioRoomsService.getActiveRooms(cursor);
  }

  @Get('upcoming')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get upcoming scheduled rooms' })
  getUpcomingRooms(@Query('cursor') cursor?: string) {
    return this.audioRoomsService.getUpcomingRooms(cursor);
  }

  @Get('recordings')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my room recordings' })
  listRecordings(@CurrentUser('id') userId: string) {
    return this.audioRoomsService.listRecordings(userId);
  }

  // ── Parameterized :id routes ──

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get audio room detail' })
  getById(
    @Param('id') id: string,
    @CurrentUser('id') viewerId?: string,
  ) {
    return this.audioRoomsService.getById(id, viewerId);
  }

  @Get(':id/recording')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get room recording' })
  getRecording(@Param('id') id: string) {
    return this.audioRoomsService.getRecording(id);
  }

  @Delete(':id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End audio room (host only)' })
  endRoom(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.audioRoomsService.endRoom(id, userId);
  }

  @Post(':id/join')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Join audio room as listener' })
  join(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.audioRoomsService.join(id, userId);
  }

  @Delete(':id/leave')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave audio room' })
  leave(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.audioRoomsService.leave(id, userId);
  }

  @Patch(':id/role')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change participant role (host only)' })
  changeRole(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RoleChangeDto,
  ) {
    return this.audioRoomsService.changeRole(id, userId, dto);
  }

  @Patch(':id/hand')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle hand raised' })
  toggleHand(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.audioRoomsService.toggleHand(id, userId);
  }

  @Patch(':id/mute')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle mute (self or host for others)' })
  toggleMute(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: MuteToggleDto,
  ) {
    return this.audioRoomsService.toggleMute(id, userId, dto.targetUserId);
  }

  @Post(':id/recording/start')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start recording (host only)' })
  startRecording(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.audioRoomsService.startRecording(id, userId);
  }

  @Post(':id/recording/stop')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop recording (host only)' })
  stopRecording(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: StopRecordingDto) {
    return this.audioRoomsService.stopRecording(id, userId, dto.recordingUrl);
  }

  @Get(':id/participants')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'List participants by role' })
  listParticipants(
    @Param('id') id: string,
    @CurrentUser('id') viewerId?: string,
    @Query('role') role?: AudioRoomRole,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audioRoomsService.listParticipants(id, viewerId, role, cursor, limit ? parseInt(limit, 10) : 50);
  }
}
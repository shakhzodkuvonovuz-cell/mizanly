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
import { AudioRoomsService } from './audio-rooms.service';
import { CreateAudioRoomDto } from './dto/create-audio-room.dto';
import { RoleChangeDto, AudioRoomRole } from './dto/role-change.dto';
import { HandToggleDto } from './dto/hand-toggle.dto';
import { MuteToggleDto } from './dto/mute-toggle.dto';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Audio Rooms')
@Controller('audio-rooms')
export class AudioRoomsController {
  constructor(private audioRoomsService: AudioRoomsService) {}

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
    @Query('limit') limit = 20,
  ) {
    return this.audioRoomsService.list(viewerId, cursor, limit);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get audio room detail' })
  getById(
    @Param('id') id: string,
    @CurrentUser('id') viewerId?: string,
  ) {
    return this.audioRoomsService.getById(id, viewerId);
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
  @ApiOperation({ summary: 'Toggle hand raised' })
  toggleHand(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: HandToggleDto,
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

  @Get(':id/participants')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'List participants by role' })
  listParticipants(
    @Param('id') id: string,
    @CurrentUser('id') viewerId?: string,
    @Query('role') role?: AudioRoomRole,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = 50,
  ) {
    return this.audioRoomsService.listParticipants(id, viewerId, role, cursor, limit);
  }
}
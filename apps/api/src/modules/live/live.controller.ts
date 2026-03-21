import { Throttle } from '@nestjs/throttler';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LiveService } from './live.service';
import { IsString, IsBoolean, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { CreateLiveDto } from './dto/create-live.dto';

class StartRehearsalDto {
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsUrl() thumbnailUrl?: string;
}

class SetSubscribersOnlyDto {
  @IsBoolean() subscribersOnly: boolean;
}

@ApiTags('Live Sessions')
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('live')
export class LiveController {
  constructor(private live: LiveService) {}

  @Post()
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @ApiOperation({ summary: 'Create live session (3/hour)' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateLiveDto) {
    return this.live.create(userId, dto);
  }

  @Get('active')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get active live sessions' })
  async getActive(@Query('type') type?: string, @Query('cursor') cursor?: string) {
    return this.live.getActive(type, cursor);
  }

  @Get('scheduled')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get upcoming scheduled sessions' })
  async getScheduled(@Query('cursor') cursor?: string) {
    return this.live.getScheduled(cursor);
  }

  @Get('my')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my live sessions' })
  async mySessions(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.live.getHostSessions(userId, cursor);
  }

  @Get(':id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get live session details' })
  async getById(@Param('id') id: string) {
    return this.live.getById(id);
  }

  @Post(':id/start')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start scheduled live session' })
  async start(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.startLive(id, userId);
  }

  @Post(':id/end')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End live session' })
  async end(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.endLive(id, userId);
  }

  @Post(':id/cancel')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel scheduled session' })
  async cancel(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.cancelLive(id, userId);
  }

  @Post(':id/join')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join live session' })
  async join(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.join(id, userId);
  }

  @Post(':id/leave')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave live session' })
  async leave(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.leave(id, userId);
  }

  @Post(':id/raise-hand')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Raise hand in audio space' })
  async raiseHand(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.raiseHand(id, userId);
  }

  @Post(':id/promote/:targetUserId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Promote participant to speaker' })
  async promote(@Param('id') id: string, @Param('targetUserId') targetUserId: string, @CurrentUser('id') userId: string) {
    return this.live.promoteToSpeaker(id, userId, targetUserId);
  }

  @Post(':id/demote/:targetUserId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demote speaker to viewer' })
  async demote(@Param('id') id: string, @Param('targetUserId') targetUserId: string, @CurrentUser('id') userId: string) {
    return this.live.demoteToViewer(id, userId, targetUserId);
  }

  @Patch(':id/recording')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set recording URL' })
  async setRecording(@Param('id') id: string, @CurrentUser('id') userId: string, @Body('recordingUrl') url: string) {
    return this.live.updateRecording(id, userId, url);
  }

  // ── Multi-guest endpoints ──────────────────────────

  @Post(':id/guests/invite')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a guest to live (max 4)' })
  async inviteGuest(@Param('id') id: string, @CurrentUser('id') userId: string, @Body('guestUserId') guestUserId: string) {
    return this.live.inviteGuest(id, guestUserId, userId);
  }

  @Post(':id/guests/accept')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept guest invitation' })
  async acceptGuest(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.acceptGuestInvite(id, userId);
  }

  @Delete(':id/guests/:userId')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a guest from live' })
  async removeGuest(@Param('id') id: string, @Param('userId') guestUserId: string, @CurrentUser('id') hostId: string) {
    return this.live.removeGuest(id, guestUserId, hostId);
  }

  @Get(':id/guests')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List guests in live session' })
  async listGuests(@Param('id') id: string) {
    return this.live.listGuests(id);
  }

  // ── Rehearsal Mode ───────────────────────────────────

  @Post('rehearse')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({ summary: 'Start a rehearsal (5/hour)' })
  async startRehearsal(@CurrentUser('id') userId: string, @Body() body: StartRehearsalDto) {
    return this.live.startRehearsal(userId, body);
  }

  @Patch(':id/go-live')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Transition rehearsal to public live' })
  async goLive(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.goLiveFromRehearsal(id, userId);
  }

  @Patch(':id/end-rehearsal')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'End rehearsal without going public' })
  async endRehearsal(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.live.endRehearsal(id, userId);
  }

  // ── Subscribers-Only Mode ────────────────────────────

  @Patch(':id/subscribers-only')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle subscribers-only mode' })
  async setSubscribersOnly(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: SetSubscribersOnlyDto,
  ) {
    return this.live.setSubscribersOnly(id, userId, body.subscribersOnly);
  }
}
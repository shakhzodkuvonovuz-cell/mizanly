import { Throttle } from '@nestjs/throttler';
import { Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsArray, ArrayMaxSize, IsEnum } from 'class-validator';
import { CallType } from '@prisma/client';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CallsService } from './calls.service';
import { InitiateCallDto } from './dto/initiate-call.dto';

class CreateGroupCallDto {
  @IsString() conversationId: string;
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(7) participantIds: string[];
  @IsEnum(CallType) callType: CallType;
}

@ApiTags('Calls')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('calls')
export class CallsController {
  constructor(private calls: CallsService) {}

  // Static routes MUST come before parameterized :id routes
  @Get('ice-servers')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Get ICE server configuration for WebRTC' })
  iceServers() {
    return this.calls.getIceServers();
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active call' })
  active(@CurrentUser('id') userId: string) {
    return this.calls.getActiveCall(userId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get call history' })
  history(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.calls.getHistory(userId, cursor);
  }

  @Post()
  @ApiOperation({ summary: 'Initiate call' })
  initiate(@CurrentUser('id') userId: string, @Body() dto: InitiateCallDto) {
    return this.calls.initiate(userId, dto.targetUserId, dto.callType);
  }

  @Post('group')
  @ApiOperation({ summary: 'Create group call (up to 8 participants)' })
  createGroupCall(@CurrentUser('id') userId: string, @Body() dto: CreateGroupCallDto) {
    return this.calls.createGroupCall(dto.conversationId, userId, dto.participantIds, dto.callType);
  }

  @Post(':id/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Answer call' })
  answer(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.calls.answer(id, userId);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline call' })
  decline(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.calls.decline(id, userId);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End call' })
  end(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.calls.end(id, userId);
  }

  @Post(':id/screen-share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start screen sharing' })
  shareScreen(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.calls.shareScreen(id, userId);
  }

  @Post(':id/screen-share/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop screen sharing' })
  stopScreenShare(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.calls.stopScreenShare(id, userId);
  }
}

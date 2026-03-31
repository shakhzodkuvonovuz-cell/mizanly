import { Throttle } from '@nestjs/throttler';
import { Controller, Post, Get, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn, Matches, MaxLength } from 'class-validator';
import { DevicesService } from './devices.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class RegisterDeviceDto {
  @IsString() @IsNotEmpty() @Matches(/^ExponentPushToken\[.+\]$|^[a-zA-Z0-9:_-]{20,}$/, { message: 'Invalid push token format' }) pushToken: string;
  @IsString() @IsIn(['ios', 'android', 'web']) platform: string;
  @IsString() @IsOptional() deviceId?: string;
}

class LogoutSessionDto {
  @IsString() @MaxLength(100) currentSessionId: string;
}

@ApiTags('Devices')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  @ApiOperation({ summary: 'Register push notification token' })
  register(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.devicesService.register(userId, dto.pushToken, dto.platform, dto.deviceId);
  }

  @Delete(':token')
  @ApiOperation({ summary: 'Unregister push notification token' })
  unregister(
    @CurrentUser('id') userId: string,
    @Param('token') token: string,
  ) {
    return this.devicesService.unregister(token, userId);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List active device sessions' })
  getSessions(@CurrentUser('id') userId: string) {
    return this.devicesService.getSessions(userId);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Log out a specific device session' })
  logoutSession(
    @CurrentUser('id') userId: string,
    @Param('id') sessionId: string,
  ) {
    return this.devicesService.logoutSession(sessionId, userId);
  }

  // A01-#9: Changed from DELETE to POST — DELETE with body is discouraged by RFC 7231
  // and some proxies strip the body, which would cause all sessions to be logged out
  @Post('sessions/logout-others')
  @ApiOperation({ summary: 'Log out all other device sessions' })
  logoutAllOtherSessions(
    @CurrentUser('id') userId: string,
    @Body() body: LogoutSessionDto,
  ) {
    return this.devicesService.logoutAllOtherSessions(userId, body.currentSessionId);
  }
}

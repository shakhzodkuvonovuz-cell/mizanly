import { Controller, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { DevicesService } from './devices.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class RegisterDeviceDto {
  @IsString() @IsNotEmpty() pushToken: string;
  @IsString() @IsNotEmpty() platform: string;
  @IsString() @IsOptional() deviceId?: string;
}

@ApiTags('Devices')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
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
}

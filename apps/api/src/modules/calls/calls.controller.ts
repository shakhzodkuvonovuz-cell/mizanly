import { Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CallsService } from './calls.service';
import { InitiateCallDto } from './dto/initiate-call.dto';

@ApiTags('Calls')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(private calls: CallsService) {}

  @Post()
  @ApiOperation({ summary: 'Initiate call' })
  async initiate(@CurrentUser('id') userId: string, @Body() dto: InitiateCallDto) {
    return this.calls.initiate(userId, dto.targetUserId, dto.callType);
  }

  @Post(':id/answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Answer call' })
  async answer(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.calls.answer(id, userId);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline call' })
  async decline(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.calls.decline(id, userId);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End call' })
  async end(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.calls.end(id, userId);
  }

  @Get('ice-servers')
  @ApiOperation({ summary: 'Get ICE server configuration for WebRTC' })
  async iceServers() {
    return this.calls.getIceServers();
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active call' })
  async active(@CurrentUser('id') userId: string) {
    return this.calls.getActiveCall(userId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get call history' })
  async history(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.calls.getHistory(userId, cursor);
  }
}
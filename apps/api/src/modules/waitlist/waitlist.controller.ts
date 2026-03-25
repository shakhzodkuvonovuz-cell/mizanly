import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';

@ApiTags('Waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post('join')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Join the waitlist' })
  @ApiResponse({ status: 200, description: 'Successfully joined or already on waitlist' })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  async join(@Body() dto: JoinWaitlistDto) {
    return this.waitlistService.join(dto);
  }

  @Get('stats')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Get waitlist stats (total count)' })
  async stats() {
    return this.waitlistService.getStats();
  }

  @Get('position/:referralCode')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @ApiOperation({ summary: 'Get waitlist position by referral code' })
  @ApiResponse({ status: 200, description: 'Position and referral count' })
  @ApiResponse({ status: 404, description: 'Referral code not found' })
  async position(@Param('referralCode') referralCode: string) {
    return this.waitlistService.getPosition(referralCode);
  }
}

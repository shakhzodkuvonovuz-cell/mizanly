import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RetentionService } from './retention.service';

@ApiTags('Retention')
@Controller('api/v1/retention')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@Throttle({ default: { ttl: 60000, limit: 30 } })
export class RetentionController {
  constructor(private retention: RetentionService) {}

  @Post('session-depth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track session depth (scroll, time, interactions)' })
  async trackSession(
    @CurrentUser('id') userId: string,
    @Body() body: {
      scrollDepth: number;
      timeSpentMs: number;
      interactionCount: number;
      space: string;
    },
  ) {
    await this.retention.trackSessionDepth(userId, body);
    return { success: true };
  }
}

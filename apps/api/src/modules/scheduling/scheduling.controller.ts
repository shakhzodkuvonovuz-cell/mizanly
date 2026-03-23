import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SchedulingService } from './scheduling.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ScheduledItem, ScheduledContent } from './scheduling.service';

class UpdateScheduleDto {
  @IsISO8601()
  @IsNotEmpty()
  scheduledAt: string;

  /**
   * Optional IANA timezone identifier (e.g. "America/New_York", "Asia/Tashkent").
   * Currently for documentation/logging purposes — the scheduledAt ISO string
   * is already parsed to UTC by the server. If the client sends a timezone-aware
   * ISO string (e.g. "2026-03-25T14:00:00+05:00"), it is automatically converted
   * to UTC. This field can be used in the future for display purposes or
   * timezone-aware scheduling features.
   */
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'IANA timezone (e.g. "Asia/Tashkent"). For future timezone-aware features.' })
  timezone?: string;
}

@ApiTags('Scheduling')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('scheduling')
export class SchedulingController {
  constructor(private schedulingService: SchedulingService) {}

  @Get('scheduled')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all scheduled content' })
  getScheduled(@CurrentUser('id') userId: string): Promise<ScheduledItem[]> {
    return this.schedulingService.getScheduled(userId);
  }

  @Patch(':type/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update scheduled time' })
  updateSchedule(
    @CurrentUser('id') userId: string,
    @Param('type') type: 'post' | 'thread' | 'reel' | 'video',
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
  ): Promise<ScheduledContent> {
    return this.schedulingService.updateSchedule(
      userId,
      type,
      id,
      new Date(dto.scheduledAt),
    );
  }

  @Delete(':type/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel scheduled post' })
  cancelSchedule(
    @CurrentUser('id') userId: string,
    @Param('type') type: 'post' | 'thread' | 'reel' | 'video',
    @Param('id') id: string,
  ): Promise<ScheduledContent> {
    return this.schedulingService.cancelSchedule(userId, type, id);
  }

  @Post('publish-now/:type/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish scheduled content immediately' })
  publishNow(
    @CurrentUser('id') userId: string,
    @Param('type') type: 'post' | 'thread' | 'reel' | 'video',
    @Param('id') id: string,
  ): Promise<ScheduledContent> {
    return this.schedulingService.publishNow(userId, type, id);
  }

  @Post('publish-overdue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Auto-publish all overdue scheduled content (internal/cron)' })
  publishOverdue() {
    return this.schedulingService.publishOverdueContent();
  }
}
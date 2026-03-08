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
import { IsISO8601, IsNotEmpty } from 'class-validator';
import { SchedulingService } from './scheduling.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ScheduledItem } from './scheduling.service';

class UpdateScheduleDto {
  @IsISO8601()
  @IsNotEmpty()
  scheduledAt: string;
}

@ApiTags('Scheduling')
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
  ): Promise<unknown> {
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
  ): Promise<unknown> {
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
  ): Promise<unknown> {
    return this.schedulingService.publishNow(userId, type, id);
  }
}
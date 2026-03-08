import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SchedulingService } from './scheduling.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Scheduling')
@Controller('scheduling')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class SchedulingController {
  constructor(private schedulingService: SchedulingService) {}

  @Get('scheduled')
  @ApiOperation({ summary: 'Get all scheduled content' })
  getScheduled(@CurrentUser('id') userId: string) {
    return this.schedulingService.getScheduled(userId);
  }

  @Patch(':type/:id')
  @ApiOperation({ summary: 'Update scheduled time' })
  updateSchedule(
    @CurrentUser('id') userId: string,
    @Param('type') type: 'post' | 'thread' | 'reel' | 'video',
    @Param('id') id: string,
    @Body() { scheduledAt }: { scheduledAt: string },
  ) {
    return this.schedulingService.updateSchedule(
      userId,
      type,
      id,
      new Date(scheduledAt),
    );
  }

  @Delete(':type/:id')
  @ApiOperation({ summary: 'Cancel scheduled post' })
  cancelSchedule(
    @CurrentUser('id') userId: string,
    @Param('type') type: 'post' | 'thread' | 'reel' | 'video',
    @Param('id') id: string,
  ) {
    return this.schedulingService.cancelSchedule(userId, type, id);
  }

  @Post('publish-now/:type/:id')
  @ApiOperation({ summary: 'Publish scheduled content immediately' })
  publishNow(
    @CurrentUser('id') userId: string,
    @Param('type') type: 'post' | 'thread' | 'reel' | 'video',
    @Param('id') id: string,
  ) {
    return this.schedulingService.publishNow(userId, type, id);
  }
}
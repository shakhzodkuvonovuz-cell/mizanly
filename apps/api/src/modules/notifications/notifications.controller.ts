import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('notifications')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications (all | mentions | verified)' })
  getNotifications(
    @CurrentUser('id') userId: string,
    @Query('filter') filter?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const validFilters = ['all', 'mentions', 'verified'];
    const safeFilter = filter && validFilters.includes(filter) ? filter as 'all' | 'mentions' | 'verified' : undefined;
    const safeLimit = Math.min(Math.max(1, limit ? parseInt(limit, 10) || 30 : 30), 50);
    return this.notificationsService.getNotifications(userId, safeFilter, cursor, safeLimit);
  }

  @Get('unread')
  @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount(@CurrentUser('id') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Get('unread-counts')
  @ApiOperation({ summary: 'Get unread counts by type' })
  getUnreadCounts(@CurrentUser('id') userId: string) {
    return this.notificationsService.getUnreadCounts(userId);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  markRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.notificationsService.markRead(id, userId);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a notification' })
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.notificationsService.deleteNotification(id, userId);
  }
}

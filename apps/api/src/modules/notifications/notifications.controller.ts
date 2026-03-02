import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  getNotifications(@CurrentUser('id') userId: string, @Query('filter') filter?: string, @Query('cursor') cursor?: string) {
    return this.notificationsService.getNotifications(userId, filter as any, cursor);
  }

  @Get('unread')
  getUnreadCount(@CurrentUser('id') userId: string) { return this.notificationsService.getUnreadCount(userId); }

  @Post(':id/read')
  markRead(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.notificationsService.markRead(id, userId); }

  @Post('read-all')
  markAllRead(@CurrentUser('id') userId: string) { return this.notificationsService.markAllRead(userId); }
}

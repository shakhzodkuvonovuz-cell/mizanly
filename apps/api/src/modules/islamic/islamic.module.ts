import { Module } from '@nestjs/common';
import { IslamicController } from './islamic.controller';
import { IslamicService } from './islamic.service';
import { IslamicNotificationsService } from './islamic-notifications.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [IslamicController],
  providers: [IslamicService, IslamicNotificationsService],
  exports: [IslamicService, IslamicNotificationsService],
})
export class IslamicModule {}
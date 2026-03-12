import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { PushTriggerService } from './push-trigger.service';
import { DevicesModule } from '../devices/devices.module';
@Module({
  imports: [DevicesModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService, PushTriggerService],
  exports: [NotificationsService, PushService, PushTriggerService],
})
export class NotificationsModule {}

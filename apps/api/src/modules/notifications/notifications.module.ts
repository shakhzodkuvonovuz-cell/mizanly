import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { InternalPushController } from './internal-push.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { PushTriggerService } from './push-trigger.service';
import { NotificationEventListener } from './notification-event.listener';
import { DevicesModule } from '../devices/devices.module';
@Module({
  imports: [DevicesModule],
  controllers: [NotificationsController, InternalPushController],
  providers: [NotificationsService, PushService, PushTriggerService, NotificationEventListener],
  exports: [NotificationsService, PushService, PushTriggerService],
})
export class NotificationsModule {}

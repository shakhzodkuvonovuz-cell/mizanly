import { Module } from '@nestjs/common';
import { BroadcastService } from './broadcast.service';
import { BroadcastController } from './broadcast.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [BroadcastController],
  providers: [BroadcastService],
  exports: [BroadcastService],
})
export class BroadcastModule {}
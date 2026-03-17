import { Module } from '@nestjs/common';
import { ReelsController } from './reels.controller';
import { ReelsService } from './reels.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StreamModule } from '../stream/stream.module';

@Module({
  imports: [NotificationsModule, StreamModule],
  controllers: [ReelsController],
  providers: [ReelsService],
  exports: [ReelsService],
})
export class ReelsModule {}
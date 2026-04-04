import { Module } from '@nestjs/common';
import { ChannelPostsService } from './channel-posts.service';
import { ChannelPostsController } from './channel-posts.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ChannelPostsController],
  providers: [ChannelPostsService],
  exports: [ChannelPostsService],
})
export class ChannelPostsModule {}

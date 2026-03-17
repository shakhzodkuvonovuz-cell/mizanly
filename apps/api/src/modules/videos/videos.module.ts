import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StreamModule } from '../stream/stream.module';

@Module({
  imports: [NotificationsModule, StreamModule],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}

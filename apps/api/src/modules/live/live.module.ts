import { Module } from '@nestjs/common';
import { LiveService } from './live.service';
import { LiveController } from './live.controller';
import { StreamModule } from '../stream/stream.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisModule } from '../../config/redis.module';

@Module({
  imports: [StreamModule, NotificationsModule, RedisModule],
  controllers: [LiveController],
  providers: [LiveService],
  exports: [LiveService],
})
export class LiveModule {}

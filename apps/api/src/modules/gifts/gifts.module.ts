import { Module } from '@nestjs/common';
import { GiftsController } from './gifts.controller';
import { GiftsService } from './gifts.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [GiftsController],
  providers: [GiftsService],
  exports: [GiftsService],
})
export class GiftsModule {}

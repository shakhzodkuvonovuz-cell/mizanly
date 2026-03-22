import { Module } from '@nestjs/common';
import { IslamicController } from './islamic.controller';
import { IslamicService } from './islamic.service';
import { IslamicNotificationsService } from './islamic-notifications.service';

@Module({
  controllers: [IslamicController],
  providers: [IslamicService, IslamicNotificationsService],
  exports: [IslamicService, IslamicNotificationsService],
})
export class IslamicModule {}
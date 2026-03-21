import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { IslamicController } from './islamic.controller';
import { IslamicService } from './islamic.service';
import { IslamicNotificationsService } from './islamic-notifications.service';

@Module({
  imports: [PrismaModule],
  controllers: [IslamicController],
  providers: [IslamicService, IslamicNotificationsService],
  exports: [IslamicService, IslamicNotificationsService],
})
export class IslamicModule {}
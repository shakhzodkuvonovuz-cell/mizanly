import { Module } from '@nestjs/common';
import { TelegramFeaturesService } from './telegram-features.service';
import { TelegramFeaturesController } from './telegram-features.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TelegramFeaturesController],
  providers: [TelegramFeaturesService],
  exports: [TelegramFeaturesService],
})
export class TelegramFeaturesModule {}

import { Module } from '@nestjs/common';
import { TelegramFeaturesService } from './telegram-features.service';
import { TelegramFeaturesController } from './telegram-features.controller';

@Module({
  controllers: [TelegramFeaturesController],
  providers: [TelegramFeaturesService],
  exports: [TelegramFeaturesService],
})
export class TelegramFeaturesModule {}

import { Module } from '@nestjs/common';
import { DiscordFeaturesService } from './discord-features.service';
import { DiscordFeaturesController } from './discord-features.controller';

@Module({
  controllers: [DiscordFeaturesController],
  providers: [DiscordFeaturesService],
  exports: [DiscordFeaturesService],
})
export class DiscordFeaturesModule {}

import { Module } from '@nestjs/common';
import { DiscordFeaturesService } from './discord-features.service';
import { DiscordFeaturesController } from './discord-features.controller';
import { PrismaModule } from '../../config/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DiscordFeaturesController],
  providers: [DiscordFeaturesService],
  exports: [DiscordFeaturesService],
})
export class DiscordFeaturesModule {}

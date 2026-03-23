import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StreamModule } from '../stream/stream.module';
import { GamificationModule } from '../gamification/gamification.module';
import { ModerationModule } from '../moderation/moderation.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [NotificationsModule, StreamModule, GamificationModule, ModerationModule, AiModule],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}

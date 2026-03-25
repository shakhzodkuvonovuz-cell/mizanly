import { Module } from '@nestjs/common';
import { ReelsController } from './reels.controller';
import { ReelsService } from './reels.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StreamModule } from '../stream/stream.module';
import { GamificationModule } from '../gamification/gamification.module';
import { AiModule } from '../ai/ai.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [NotificationsModule, StreamModule, GamificationModule, AiModule, ModerationModule],
  controllers: [ReelsController],
  providers: [ReelsService],
  exports: [ReelsService],
})
export class ReelsModule {}
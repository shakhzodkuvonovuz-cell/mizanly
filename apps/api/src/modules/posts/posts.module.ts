import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { GamificationModule } from '../gamification/gamification.module';
import { AiModule } from '../ai/ai.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [NotificationsModule, GamificationModule, AiModule, ModerationModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}

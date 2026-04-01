import { Module } from '@nestjs/common';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ModerationModule } from '../moderation/moderation.module';
@Module({ imports: [AiModule, NotificationsModule, ModerationModule], controllers: [StoriesController], providers: [StoriesService], exports: [StoriesService] })
export class StoriesModule {}

import { Module } from '@nestjs/common';
import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { GamificationModule } from '../gamification/gamification.module';
import { AiModule } from '../ai/ai.module';
@Module({ imports: [NotificationsModule, GamificationModule, AiModule], controllers: [ThreadsController], providers: [ThreadsService], exports: [ThreadsService] })
export class ThreadsModule {}

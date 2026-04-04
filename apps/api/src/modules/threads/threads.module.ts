import { Module } from '@nestjs/common';
import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';
import { AiModule } from '../ai/ai.module';
import { ModerationModule } from '../moderation/moderation.module';
@Module({ imports: [AiModule, ModerationModule], controllers: [ThreadsController], providers: [ThreadsService], exports: [ThreadsService] })
export class ThreadsModule {}

import { Module } from '@nestjs/common';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { AiModule } from '../ai/ai.module';
@Module({ imports: [AiModule], controllers: [StoriesController], providers: [StoriesService], exports: [StoriesService] })
export class StoriesModule {}

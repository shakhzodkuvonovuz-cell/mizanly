import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { StreamModule } from '../stream/stream.module';
import { ModerationModule } from '../moderation/moderation.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [StreamModule, ModerationModule, AiModule],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}

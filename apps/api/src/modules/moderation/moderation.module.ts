import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { ContentSafetyService } from './content-safety.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [ModerationController],
  providers: [ModerationService, ContentSafetyService],
  exports: [ModerationService, ContentSafetyService],
})
export class ModerationModule {}
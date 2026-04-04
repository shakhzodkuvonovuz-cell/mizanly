import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { ContentSafetyService } from './content-safety.service';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * ModerationModule — Two complementary services, one module.
 *
 * Architecture note (#26 fix):
 *
 * ModerationService (admin-facing):
 *   - REST endpoints for moderation queue, review actions, appeals
 *   - Word-filter-based text checks (synchronous, local)
 *   - Image moderation via AiService (Claude Vision)
 *   - Admin review workflow (approve / remove / warn)
 *   - Appeal submission, listing, and resolution
 *   - Injected by: ModerationController
 *
 * ContentSafetyService (inline pipeline):
 *   - AI-based text moderation (Claude NLP, Islamic-context analysis)
 *   - Forward-limit enforcement
 *   - Kindness reminder detection
 *   - Auto-remove pipeline with audit logging
 *   - Viral content throttling
 *   - Injected by: PostsService, ThreadsService, ChannelsService, VideosService
 *
 * Why two services instead of one:
 *   - ModerationService depends on AiService and NotificationsService (heavier DI graph).
 *   - ContentSafetyService depends on Redis + Anthropic API (no Prisma relations needed).
 *   - Merging them would create a god-service with 20+ methods and conflicting DI needs.
 *   - Consumers are completely disjoint: controllers vs inline content creation pipelines.
 *
 * @see ModerationService JSDoc for detailed responsibility boundary
 * @see ContentSafetyService JSDoc for detailed responsibility boundary
 */
@Module({
  imports: [AiModule, NotificationsModule],
  controllers: [ModerationController],
  providers: [ModerationService, ContentSafetyService],
  exports: [ModerationService, ContentSafetyService],
})
export class ModerationModule {}
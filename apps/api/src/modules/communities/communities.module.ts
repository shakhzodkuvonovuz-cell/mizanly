import { Module } from '@nestjs/common';
import { CommunitiesController } from './communities.controller';
import { CommunitiesService } from './communities.service';

/**
 * CommunitiesModule — public/private community management with roles, rules, and moderation.
 * Communities are group spaces (like Discord servers or Facebook Groups) with admin tools.
 *
 * This is SEPARATE from CirclesModule by design:
 * - CommunitiesModule: public/private communities with roles, rules, moderation (like Discord servers)
 * - CirclesModule: private, user-owned friend lists for controlling post audience
 * Both use the Prisma Circle model but serve different user-facing features.
 */
@Module({
  controllers: [CommunitiesController],
  providers: [CommunitiesService],
  exports: [CommunitiesService],
})
export class CommunitiesModule {}
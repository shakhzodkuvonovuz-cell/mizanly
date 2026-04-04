import { Module } from '@nestjs/common';
import { CirclesController } from './circles.controller';
import { CirclesService } from './circles.service';

/**
 * CirclesModule — user-facing circle management (create, rename, add/remove members).
 * Circles are lightweight friend groups for controlling post audience (like Instagram Close Friends).
 *
 * This is SEPARATE from CommunitiesModule by design:
 * - CirclesModule: private, user-owned, friend lists (1:many owner→circles)
 * - CommunitiesModule: public/private communities with roles, rules, moderation (like Discord servers)
 * Both use the Prisma Circle model but serve different user-facing features.
 */
@Module({ controllers: [CirclesController], providers: [CirclesService], exports: [CirclesService] })
export class CirclesModule {}

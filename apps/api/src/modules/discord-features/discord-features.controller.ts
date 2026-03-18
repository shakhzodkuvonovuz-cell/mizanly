import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DiscordFeaturesService } from './discord-features.service';
import {
  CreateForumThreadDto, ForumReplyDto, CreateWebhookDto,
  ExecuteWebhookDto, CreateStageSessionDto, InviteSpeakerDto,
} from './dto/discord-features.dto';

@ApiTags('Discord Features')
@Controller()
export class DiscordFeaturesController {
  constructor(private service: DiscordFeaturesService) {}

  // ── Forum Threads ───────────────────────────────────────

  @Post('circles/:circleId/forum')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create forum thread' })
  createForumThread(@CurrentUser('id') userId: string, @Param('circleId') circleId: string,
    @Body() dto: CreateForumThreadDto) {
    return this.service.createForumThread(userId, circleId, dto);
  }

  @Get('circles/:circleId/forum')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get forum threads' })
  getForumThreads(@Param('circleId') circleId: string, @Query('cursor') cursor?: string) {
    return this.service.getForumThreads(circleId, cursor);
  }

  @Get('forum/:threadId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get forum thread detail' })
  getForumThread(@Param('threadId') threadId: string) {
    return this.service.getForumThread(threadId);
  }

  @Post('forum/:threadId/reply')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Reply to forum thread' })
  replyToForumThread(@CurrentUser('id') userId: string, @Param('threadId') threadId: string,
    @Body() dto: ForumReplyDto) {
    return this.service.replyToForumThread(userId, threadId, dto.content);
  }

  @Get('forum/:threadId/replies')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get forum thread replies' })
  getForumReplies(@Param('threadId') threadId: string, @Query('cursor') cursor?: string) {
    return this.service.getForumReplies(threadId, cursor);
  }

  @Patch('forum/:threadId/lock')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Lock forum thread' })
  lockForumThread(@CurrentUser('id') userId: string, @Param('threadId') threadId: string) {
    return this.service.lockForumThread(threadId, userId);
  }

  @Patch('forum/:threadId/pin')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Toggle pin on forum thread' })
  pinForumThread(@CurrentUser('id') userId: string, @Param('threadId') threadId: string) {
    return this.service.pinForumThread(threadId, userId);
  }

  // ── Webhooks ────────────────────────────────────────────

  @Post('circles/:circleId/webhooks')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Create webhook' })
  createWebhook(@CurrentUser('id') userId: string, @Param('circleId') circleId: string,
    @Body() dto: CreateWebhookDto) {
    return this.service.createWebhook(userId, circleId, dto);
  }

  @Get('circles/:circleId/webhooks')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get webhooks for community' })
  getWebhooks(@Param('circleId') circleId: string) {
    return this.service.getWebhooks(circleId);
  }

  @Delete('webhooks/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Delete webhook' })
  deleteWebhook(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.deleteWebhook(id, userId);
  }

  @Post('webhooks/:token/execute')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Execute webhook (external)' })
  executeWebhook(@Param('token') token: string, @Body() dto: ExecuteWebhookDto) {
    return this.service.executeWebhook(token, dto);
  }

  // ── Stage Sessions ──────────────────────────────────────

  @Post('circles/:circleId/stage')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create stage session' })
  createStageSession(@CurrentUser('id') userId: string, @Param('circleId') circleId: string,
    @Body() dto: CreateStageSessionDto) {
    return this.service.createStageSession(userId, circleId, dto);
  }

  @Post('stage/:id/start')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Start stage session' })
  startStage(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.startStageSession(id, userId);
  }

  @Post('stage/:id/end')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'End stage session' })
  endStage(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.endStageSession(id, userId);
  }

  @Post('stage/:id/speaker')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Invite speaker to stage' })
  inviteSpeaker(@CurrentUser('id') userId: string, @Param('id') id: string,
    @Body() dto: InviteSpeakerDto) {
    return this.service.inviteSpeaker(id, userId, dto.speakerId);
  }

  @Get('stage/active')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get active stage sessions' })
  getActiveStageSessions(@Query('circleId') circleId?: string) {
    return this.service.getActiveStageSessions(circleId);
  }
}

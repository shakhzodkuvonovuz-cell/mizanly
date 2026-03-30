import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ModerationService, CheckTextDto, CheckImageDto, ReviewActionDto, SubmitAppealDto, ResolveAppealDto } from './moderation.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Moderation')
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller('moderation')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class ModerationController {
  constructor(private moderationService: ModerationService) {}

  @Post('check-text')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Check text for violations' })
  checkText(
    @CurrentUser('id') userId: string,
    @Body() dto: CheckTextDto,
  ) {
    return this.moderationService.checkText(userId, dto);
  }

  @Post('check-image')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Check image URL for violations' })
  checkImage(
    @CurrentUser('id') userId: string,
    @Body() dto: CheckImageDto,
  ) {
    return this.moderationService.checkImage(userId, dto);
  }

  @Get('queue')
  @ApiOperation({ summary: 'Get pending moderation queue (admin only)' })
  getQueue(
    @CurrentUser('id') adminId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.moderationService.getQueue(adminId, cursor);
  }

  @Patch('review/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Review flagged content (admin only)' })
  review(
    @CurrentUser('id') adminId: string,
    @Param('id') reportId: string,
    @Body() dto: ReviewActionDto,
  ) {
    return this.moderationService.review(adminId, reportId, dto.action, dto.note);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Moderation stats (admin only)' })
  getStats(@CurrentUser('id') adminId: string) {
    return this.moderationService.getStats(adminId);
  }

  @Get('my-actions')
  @ApiOperation({ summary: 'Get moderation actions against current user' })
  getMyActions(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.moderationService.getMyActions(userId, cursor);
  }

  @Get('my-appeals')
  @ApiOperation({ summary: 'Get user appeals for moderation actions' })
  getMyAppeals(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.moderationService.getMyAppeals(userId, cursor);
  }

  @Post('appeal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit appeal for a moderation action' })
  submitAppeal(
    @CurrentUser('id') userId: string,
    @Body() dto: SubmitAppealDto,
  ) {
    return this.moderationService.submitAppeal(userId, dto);
  }

  @Get('pending-appeals')
  @ApiOperation({ summary: 'Get pending appeals (admin only)' })
  getPendingAppeals(
    @CurrentUser('id') adminId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.moderationService.getPendingAppeals(adminId, cursor);
  }

  @Patch('appeal/:logId/resolve')
  @ApiOperation({ summary: 'Resolve an appeal (admin only)' })
  resolveAppeal(
    @CurrentUser('id') adminId: string,
    @Param('logId') logId: string,
    @Body() dto: ResolveAppealDto,
  ) {
    return this.moderationService.resolveAppeal(adminId, logId, dto.accepted, dto.result);
  }
}
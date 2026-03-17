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
import { ModerationService, CheckTextDto, CheckImageDto, ReviewActionDto, SubmitAppealDto } from './moderation.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Moderation')
@Controller('moderation')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class ModerationController {
  constructor(private moderationService: ModerationService) {}

  @Post('check-text')
  @ApiOperation({ summary: 'Check text for violations' })
  checkText(
    @CurrentUser('id') userId: string,
    @Body() dto: CheckTextDto,
  ) {
    return this.moderationService.checkText(userId, dto);
  }

  @Post('check-image')
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
}
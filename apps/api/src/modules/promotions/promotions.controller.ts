import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PromotionsService } from './promotions.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class BoostPostDto {
  postId: string;
  budget: number;
  duration: number;
}

class SetReminderDto {
  postId: string;
  remindAt: string;
}

class MarkBrandedDto {
  postId: string;
  partnerName: string;
}

@ApiTags('Promotions')
@Controller('promotions')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class PromotionsController {
  constructor(private promotionsService: PromotionsService) {}

  @Post('boost')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Boost a post for increased reach' })
  @ApiResponse({ status: 201, description: 'Promotion created' })
  @ApiResponse({ status: 400, description: 'Invalid budget or already promoted' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  boostPost(
    @CurrentUser('id') userId: string,
    @Body() dto: BoostPostDto,
  ) {
    return this.promotionsService.boostPost(userId, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Get my promotions' })
  @ApiResponse({ status: 200, description: 'Promotions retrieved' })
  getMyPromotions(@CurrentUser('id') userId: string) {
    return this.promotionsService.getMyPromotions(userId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an active promotion' })
  @ApiResponse({ status: 200, description: 'Promotion cancelled' })
  @ApiResponse({ status: 404, description: 'Promotion not found' })
  cancelPromotion(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.promotionsService.cancelPromotion(id, userId);
  }

  @Post('reminder')
  @ApiOperation({ summary: 'Set a reminder for a post' })
  @ApiResponse({ status: 201, description: 'Reminder set' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  setReminder(
    @CurrentUser('id') userId: string,
    @Body() dto: SetReminderDto,
  ) {
    return this.promotionsService.setReminder(userId, dto.postId, dto.remindAt);
  }

  @Delete('reminder/:postId')
  @ApiOperation({ summary: 'Remove a post reminder' })
  @ApiResponse({ status: 200, description: 'Reminder removed' })
  @ApiResponse({ status: 404, description: 'Reminder not found' })
  removeReminder(
    @CurrentUser('id') userId: string,
    @Param('postId') postId: string,
  ) {
    return this.promotionsService.removeReminder(userId, postId);
  }

  @Post('branded')
  @ApiOperation({ summary: 'Mark a post as branded/sponsored content' })
  @ApiResponse({ status: 201, description: 'Post marked as branded' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  markBranded(
    @CurrentUser('id') userId: string,
    @Body() dto: MarkBrandedDto,
  ) {
    return this.promotionsService.markBranded(userId, dto.postId, dto.partnerName);
  }
}

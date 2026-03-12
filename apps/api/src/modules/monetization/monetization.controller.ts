import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MonetizationService } from './monetization.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// DTOs defined inline
class CreateTipDto {
  receiverId: string;
  amount: number;
  message?: string;
}

class CreateTierDto {
  name: string;
  price: number;
  benefits: string[];
  level?: string; // defaults to 'bronze'
}

class UpdateTierDto {
  name?: string;
  price?: number;
  benefits?: string[];
  level?: string;
  isActive?: boolean;
}

@ApiTags('Monetization')
@Controller('monetization')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
export class MonetizationController {
  constructor(private monetizationService: MonetizationService) {}

  // === Tips ===
  @Post('tips')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Send a tip to another user' })
  @ApiResponse({ status: 201, description: 'Tip sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid amount or self-tip' })
  sendTip(
    @CurrentUser('id') senderId: string,
    @Body() dto: CreateTipDto,
  ) {
    return this.monetizationService.sendTip(senderId, dto.receiverId, dto.amount, dto.message);
  }

  @Get('tips/sent')
  @ApiOperation({ summary: 'List tips sent by the current user' })
  @ApiResponse({ status: 200, description: 'Paginated list of sent tips' })
  getSentTips(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.monetizationService.getSentTips(userId, cursor);
  }

  @Get('tips/received')
  @ApiOperation({ summary: 'List tips received by the current user' })
  @ApiResponse({ status: 200, description: 'Paginated list of received tips' })
  getReceivedTips(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.monetizationService.getReceivedTips(userId, cursor);
  }

  @Get('tips/stats')
  @ApiOperation({ summary: 'Get tip statistics for the current user' })
  @ApiResponse({ status: 200, description: 'Tip stats' })
  getTipStats(@CurrentUser('id') userId: string) {
    return this.monetizationService.getTipStats(userId);
  }

  // === Membership Tiers ===
  @Post('tiers')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a membership tier' })
  @ApiResponse({ status: 201, description: 'Tier created successfully' })
  createTier(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTierDto,
  ) {
    return this.monetizationService.createTier(userId, dto.name, dto.price, dto.benefits, dto.level);
  }

  @Get('tiers/:userId')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: "List a user's membership tiers" })
  @ApiResponse({ status: 200, description: 'List of tiers (public)' })
  getUserTiers(@Param('userId') userId: string) {
    return this.monetizationService.getUserTiers(userId);
  }

  @Patch('tiers/:id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Update a membership tier (owner only)' })
  @ApiResponse({ status: 200, description: 'Tier updated successfully' })
  @ApiResponse({ status: 403, description: 'Not the tier owner' })
  updateTier(
    @Param('id') tierId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTierDto,
  ) {
    return this.monetizationService.updateTier(tierId, userId, dto);
  }

  @Delete('tiers/:id')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Delete a membership tier (owner only)' })
  @ApiResponse({ status: 200, description: 'Tier deleted successfully' })
  @ApiResponse({ status: 403, description: 'Not the tier owner' })
  deleteTier(
    @Param('id') tierId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.monetizationService.deleteTier(tierId, userId);
  }

  @Patch('tiers/:id/toggle')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Toggle tier active/inactive (owner only)' })
  @ApiResponse({ status: 200, description: 'Tier toggled successfully' })
  @ApiResponse({ status: 403, description: 'Not the tier owner' })
  toggleTier(
    @Param('id') tierId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.monetizationService.toggleTier(tierId, userId);
  }

  // === Subscriptions ===
  @Post('subscribe/:tierId')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Subscribe to a membership tier' })
  @ApiResponse({ status: 201, description: 'Subscribed successfully' })
  subscribe(
    @CurrentUser('id') userId: string,
    @Param('tierId') tierId: string,
  ) {
    return this.monetizationService.subscribe(tierId, userId);
  }

  @Delete('subscribe/:tierId')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Unsubscribe from a membership tier' })
  @ApiResponse({ status: 200, description: 'Unsubscribed successfully' })
  unsubscribe(
    @CurrentUser('id') userId: string,
    @Param('tierId') tierId: string,
  ) {
    return this.monetizationService.unsubscribe(tierId, userId);
  }

  @Get('subscribers')
  @ApiOperation({ summary: 'List subscribers to your tiers' })
  @ApiResponse({ status: 200, description: 'Paginated list of subscribers' })
  getSubscribers(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.monetizationService.getSubscribers(userId, cursor);
  }
}
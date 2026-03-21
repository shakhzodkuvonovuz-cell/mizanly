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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MonetizationService } from './monetization.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, IsIn, Min, Max, MaxLength, ArrayMaxSize } from 'class-validator';

class CreateTipDto {
  @IsString() @MaxLength(50) receiverId: string;
  @IsNumber() @Min(0.01) @Max(10000) amount: number;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}

class CreateTierDto {
  @IsString() @MaxLength(100) name: string;
  @IsNumber() @Min(0.01) @Max(10000) price: number;
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(20) benefits: string[];
  @IsOptional() @IsIn(['bronze', 'silver', 'gold', 'platinum']) level?: string;
}

class UpdateTierDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsNumber() @Min(0.01) @Max(10000) price?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20) benefits?: string[];
  @IsOptional() @IsIn(['bronze', 'silver', 'gold', 'platinum']) level?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('Monetization')
@Controller('monetization')
export class MonetizationController {
  constructor(private monetizationService: MonetizationService) {}

  // === Tips ===
  @Post('tips')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List tips sent by the current user' })
  @ApiResponse({ status: 200, description: 'Paginated list of sent tips' })
  getSentTips(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.monetizationService.getSentTips(userId, cursor);
  }

  @Get('tips/received')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List tips received by the current user' })
  @ApiResponse({ status: 200, description: 'Paginated list of received tips' })
  getReceivedTips(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.monetizationService.getReceivedTips(userId, cursor);
  }

  @Get('tips/stats')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get tip statistics for the current user' })
  @ApiResponse({ status: 200, description: 'Tip stats' })
  getTipStats(@CurrentUser('id') userId: string) {
    return this.monetizationService.getTipStats(userId);
  }

  // === Membership Tiers ===
  @Post('tiers')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
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
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List subscribers to your tiers' })
  @ApiResponse({ status: 200, description: 'Paginated list of subscribers' })
  getSubscribers(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.monetizationService.getSubscribers(userId, cursor);
  }
}
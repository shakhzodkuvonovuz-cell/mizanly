import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsString, IsOptional, Min, Max, MaxLength } from 'class-validator';
import { GiftsService } from './gifts.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class PurchaseCoinsDto {
  @IsInt() @Min(1) @Max(100000) amount: number;
}

class SendGiftDto {
  @IsString() @MaxLength(50) receiverId: string;
  @IsString() @MaxLength(30) giftType: string;
  @IsOptional() @IsString() @MaxLength(50) contentId?: string;
  @IsOptional() @IsString() @MaxLength(30) contentType?: string;
}

class CashoutDto {
  @IsInt() @Min(100) @Max(10000000) diamonds: number;
}

@ApiTags('Gifts')
@Controller('gifts')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class GiftsController {
  constructor(private giftsService: GiftsService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get coin and diamond balance' })
  @ApiResponse({ status: 200, description: 'Balance retrieved' })
  getBalance(@CurrentUser('id') userId: string) {
    return this.giftsService.getBalance(userId);
  }

  @Post('purchase')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Purchase coins' })
  @ApiResponse({ status: 200, description: 'Coins purchased' })
  @ApiResponse({ status: 400, description: 'Invalid amount' })
  purchaseCoins(
    @CurrentUser('id') userId: string,
    @Body() dto: PurchaseCoinsDto,
  ) {
    return this.giftsService.purchaseCoins(userId, dto.amount);
  }

  @Post('send')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a gift to another user' })
  @ApiResponse({ status: 201, description: 'Gift sent' })
  @ApiResponse({ status: 400, description: 'Insufficient coins or self-gift' })
  @ApiResponse({ status: 404, description: 'Gift type or receiver not found' })
  sendGift(
    @CurrentUser('id') senderId: string,
    @Body() dto: SendGiftDto,
  ) {
    return this.giftsService.sendGift(senderId, dto);
  }

  @Get('catalog')
  @ApiOperation({ summary: 'Get available gift catalog' })
  @ApiResponse({ status: 200, description: 'Catalog retrieved' })
  getCatalog() {
    return this.giftsService.getCatalog();
  }

  @Get('history')
  @ApiOperation({ summary: 'Get coin transaction history' })
  @ApiResponse({ status: 200, description: 'Transaction history retrieved' })
  getHistory(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.giftsService.getHistory(userId, cursor, limit ? parseInt(limit, 10) : 20);
  }

  @Post('cashout')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cash out diamonds to USD' })
  @ApiResponse({ status: 200, description: 'Cashout processed' })
  @ApiResponse({ status: 400, description: 'Insufficient diamonds or below minimum' })
  cashout(
    @CurrentUser('id') userId: string,
    @Body() dto: CashoutDto,
  ) {
    return this.giftsService.cashout(userId, dto.diamonds);
  }

  @Get('received')
  @ApiOperation({ summary: 'Get aggregated received gifts' })
  @ApiResponse({ status: 200, description: 'Received gifts retrieved' })
  getReceivedGifts(@CurrentUser('id') userId: string) {
    return this.giftsService.getReceivedGifts(userId);
  }
}

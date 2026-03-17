import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommerceService } from './commerce.service';

@ApiTags('Commerce')
@Controller()
export class CommerceController {
  constructor(private commerceService: CommerceService) {}

  // ── Products ────────────────────────────────────────────

  @Post('products')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create product listing' })
  createProduct(@CurrentUser('id') userId: string, @Body() dto: {
    title: string; description: string; price: number; images: string[];
    category: string; isHalal?: boolean; isMuslimOwned?: boolean;
    stock?: number; tags?: string[]; location?: string;
  }) {
    return this.commerceService.createProduct(userId, dto);
  }

  @Get('products')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Browse marketplace' })
  getProducts(
    @Query('cursor') cursor?: string, @Query('limit') limit?: string,
    @Query('category') category?: string, @Query('search') search?: string,
  ) {
    return this.commerceService.getProducts(cursor, limit ? parseInt(limit) : undefined, category, search);
  }

  @Get('products/:id')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Get product detail' })
  getProduct(@Param('id') id: string) {
    return this.commerceService.getProduct(id);
  }

  @Post('products/:id/review')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Review product' })
  reviewProduct(@CurrentUser('id') userId: string, @Param('id') id: string,
    @Body() dto: { rating: number; comment?: string }) {
    return this.commerceService.reviewProduct(userId, id, dto.rating, dto.comment);
  }

  // ── Orders ──────────────────────────────────────────────

  @Post('orders')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create order' })
  createOrder(@CurrentUser('id') userId: string, @Body() dto: {
    productId: string; quantity?: number; installments?: number; shippingAddress?: string;
  }) {
    return this.commerceService.createOrder(userId, dto);
  }

  @Get('orders/me')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get my orders' })
  getMyOrders(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.commerceService.getMyOrders(userId, cursor);
  }

  @Patch('orders/:id/status')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Update order status (seller)' })
  updateOrderStatus(@CurrentUser('id') userId: string, @Param('id') id: string,
    @Body() dto: { status: string }) {
    return this.commerceService.updateOrderStatus(id, userId, dto.status);
  }

  // ── Halal Business Directory ────────────────────────────

  @Post('businesses')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Register halal business' })
  createBusiness(@CurrentUser('id') userId: string, @Body() dto: {
    name: string; description?: string; category: string;
    address?: string; lat?: number; lng?: number; phone?: string; website?: string;
  }) {
    return this.commerceService.createBusiness(userId, dto);
  }

  @Get('businesses')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Browse halal businesses' })
  getBusinesses(
    @Query('cursor') cursor?: string, @Query('category') category?: string,
    @Query('lat') lat?: string, @Query('lng') lng?: string,
  ) {
    return this.commerceService.getBusinesses(
      cursor, undefined, category,
      lat ? parseFloat(lat) : undefined, lng ? parseFloat(lng) : undefined,
    );
  }

  @Post('businesses/:id/review')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Review business' })
  reviewBusiness(@CurrentUser('id') userId: string, @Param('id') id: string,
    @Body() dto: { rating: number; comment?: string }) {
    return this.commerceService.reviewBusiness(userId, id, dto.rating, dto.comment);
  }

  // ── Zakat ───────────────────────────────────────────────

  @Post('zakat/funds')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create zakat fund' })
  createZakatFund(@CurrentUser('id') userId: string, @Body() dto: {
    title: string; description: string; goalAmount: number; category: string;
  }) {
    return this.commerceService.createZakatFund(userId, dto);
  }

  @Get('zakat/funds')
  @UseGuards(OptionalClerkAuthGuard)
  @ApiOperation({ summary: 'Browse zakat funds' })
  getZakatFunds(@Query('cursor') cursor?: string, @Query('category') category?: string) {
    return this.commerceService.getZakatFunds(cursor, undefined, category);
  }

  @Post('zakat/funds/:id/donate')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Donate to zakat fund' })
  donateZakat(@CurrentUser('id') userId: string, @Param('id') id: string,
    @Body() dto: { amount: number; isAnonymous?: boolean }) {
    return this.commerceService.donateZakat(userId, id, dto);
  }

  // ── Community Treasury ──────────────────────────────────

  @Post('treasury')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create community treasury' })
  createTreasury(@CurrentUser('id') userId: string, @Body() dto: {
    circleId: string; title: string; description?: string; goalAmount: number;
  }) {
    return this.commerceService.createTreasury(userId, dto.circleId, dto);
  }

  @Post('treasury/:id/contribute')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Contribute to treasury' })
  contributeTreasury(@CurrentUser('id') userId: string, @Param('id') id: string,
    @Body() dto: { amount: number }) {
    return this.commerceService.contributeTreasury(userId, id, dto.amount);
  }

  // ── Premium ─────────────────────────────────────────────

  @Get('premium/status')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get premium status' })
  getPremiumStatus(@CurrentUser('id') userId: string) {
    return this.commerceService.getPremiumStatus(userId);
  }

  @Post('premium/subscribe')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Subscribe to premium' })
  subscribePremium(@CurrentUser('id') userId: string, @Body() dto: { plan: string }) {
    return this.commerceService.subscribePremium(userId, dto.plan);
  }

  @Delete('premium/cancel')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Cancel premium' })
  cancelPremium(@CurrentUser('id') userId: string) {
    return this.commerceService.cancelPremium(userId);
  }
}

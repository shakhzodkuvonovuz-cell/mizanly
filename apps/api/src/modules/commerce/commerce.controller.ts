import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommerceService } from './commerce.service';
import {
  CreateProductDto, UpdateProductDto, ReviewDto, CreateOrderDto, UpdateOrderStatusDto,
  CreateBusinessDto, UpdateBusinessDto, CreateZakatFundDto, DonateZakatDto,
  CreateTreasuryDto, ContributeTreasuryDto, SubscribePremiumDto,
} from './dto/commerce.dto';

@ApiTags('Commerce')
@ApiBearerAuth()
@Controller()
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class CommerceController {
  constructor(private commerceService: CommerceService) {}

  // ── Products ────────────────────────────────────────────

  @Post('products')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create product listing' })
  createProduct(@CurrentUser('id') userId: string, @Body() dto: CreateProductDto) {
    return this.commerceService.createProduct(userId, dto);
  }

  @Get('products')
  @UseGuards(OptionalClerkAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Browse marketplace' })
  getProducts(
    @Query('cursor') cursor?: string, @Query('limit') limit?: string,
    @Query('category') category?: string, @Query('search') search?: string,
  ) {
    return this.commerceService.getProducts(cursor, limit ? parseInt(limit, 10) : undefined, category, search);
  }

  @Get('products/:id')
  @UseGuards(OptionalClerkAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Get product detail' })
  getProduct(@Param('id') id: string) {
    return this.commerceService.getProduct(id);
  }

  @Patch('products/:id')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Update product listing (owner only)' })
  updateProduct(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.commerceService.updateProduct(userId, id, dto);
  }

  @Delete('products/:id')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Delete product listing (owner only)' })
  deleteProduct(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.commerceService.deleteProduct(userId, id);
  }

  @Post('products/:id/review')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Review product' })
  reviewProduct(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.commerceService.reviewProduct(userId, id, dto.rating, dto.comment);
  }

  // ── Orders ──────────────────────────────────────────────

  @Post('orders')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create order' })
  createOrder(@CurrentUser('id') userId: string, @Body() dto: CreateOrderDto) {
    return this.commerceService.createOrder(userId, dto);
  }

  @Get('orders/me')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get my orders (buyer)' })
  getMyOrders(@CurrentUser('id') userId: string, @Query('cursor') cursor?: string) {
    return this.commerceService.getMyOrders(userId, cursor);
  }

  @Get('orders/selling')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Get orders for my products (seller)' })
  getSellerOrders(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('status') status?: string,
  ) {
    return this.commerceService.getSellerOrders(userId, cursor, undefined, status);
  }

  @Patch('orders/:id/status')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Update order status (seller)' })
  updateOrderStatus(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.commerceService.updateOrderStatus(id, userId, dto.status);
  }

  @Get('seller/analytics')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get seller analytics — total sales, revenue, top products' })
  getSellerAnalytics(@CurrentUser('id') userId: string) {
    return this.commerceService.getSellerAnalytics(userId);
  }

  // ── Halal Business Directory ────────────────────────────

  @Post('businesses')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Register halal business' })
  createBusiness(@CurrentUser('id') userId: string, @Body() dto: CreateBusinessDto) {
    return this.commerceService.createBusiness(userId, dto);
  }

  @Get('businesses')
  @UseGuards(OptionalClerkAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
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

  @Patch('businesses/:id')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Update halal business (owner only)' })
  updateBusiness(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateBusinessDto) {
    return this.commerceService.updateBusiness(userId, id, dto);
  }

  @Delete('businesses/:id')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Delete halal business (owner only)' })
  deleteBusiness(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.commerceService.deleteBusiness(userId, id);
  }

  @Post('businesses/:id/review')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Review business' })
  reviewBusiness(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.commerceService.reviewBusiness(userId, id, dto.rating, dto.comment);
  }

  // ── Zakat ───────────────────────────────────────────────

  @Post('zakat/funds')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create zakat fund' })
  createZakatFund(@CurrentUser('id') userId: string, @Body() dto: CreateZakatFundDto) {
    return this.commerceService.createZakatFund(userId, dto);
  }

  @Get('zakat/funds')
  @UseGuards(OptionalClerkAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Browse zakat funds' })
  getZakatFunds(@Query('cursor') cursor?: string, @Query('category') category?: string) {
    return this.commerceService.getZakatFunds(cursor, undefined, category);
  }

  @Post('zakat/funds/:id/donate')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Donate to zakat fund' })
  donateZakat(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: DonateZakatDto) {
    return this.commerceService.donateZakat(userId, id, dto);
  }

  // ── Waqf (Endowment) ─────────────────────────────────

  @Get('waqf/funds')
  @UseGuards(OptionalClerkAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Browse waqf funds' })
  getWaqfFunds(@Query('cursor') cursor?: string) {
    return this.commerceService.getWaqfFunds(cursor);
  }

  @Post('waqf/funds/:id/contribute')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Contribute to waqf fund' })
  contributeWaqf(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ContributeTreasuryDto) {
    return this.commerceService.contributeWaqf(userId, id, dto.amount);
  }

  // ── Community Treasury ──────────────────────────────────

  @Post('treasury')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Create community treasury' })
  createTreasury(@CurrentUser('id') userId: string, @Body() dto: CreateTreasuryDto) {
    return this.commerceService.createTreasury(userId, dto.circleId, dto);
  }

  @Post('treasury/:id/contribute')
  @UseGuards(ClerkAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Contribute to treasury' })
  contributeTreasury(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ContributeTreasuryDto) {
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
  subscribePremium(@CurrentUser('id') userId: string, @Body() dto: SubscribePremiumDto) {
    return this.commerceService.subscribePremium(userId, dto.plan);
  }

  @Delete('premium/cancel')
  @UseGuards(ClerkAuthGuard)
  @ApiOperation({ summary: 'Cancel premium' })
  cancelPremium(@CurrentUser('id') userId: string) {
    return this.commerceService.cancelPremium(userId);
  }
}

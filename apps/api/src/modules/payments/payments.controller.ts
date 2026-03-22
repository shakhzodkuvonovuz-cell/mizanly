import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsNumber, IsString, Min, Max, MaxLength, IsIn } from 'class-validator';
import { PaymentsService } from './payments.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class CreatePaymentIntentDto {
  @IsNumber() @Min(50) @Max(10000000) amount: number;
  @IsIn(['usd', 'gbp', 'eur', 'aud', 'cad']) currency: string;
  @IsString() @MaxLength(50) receiverId: string;
}

class CreateSubscriptionDto {
  @IsString() @MaxLength(50) tierId: string;
  @IsString() @MaxLength(100) paymentMethodId: string;
}

class AttachPaymentMethodDto {
  @IsString() @MaxLength(100) paymentMethodId: string;
}

@ApiTags('Payments')
@Controller('payments')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth()
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  // === Payment Intents (one-time tips) ===
  @Post('create-payment-intent')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create Stripe PaymentIntent for a tip' })
  @ApiResponse({ status: 201, description: 'PaymentIntent created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid amount or receiver' })
  createPaymentIntent(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    return this.paymentsService.createPaymentIntent(userId, dto.receiverId, dto.amount, dto.currency);
  }

  // === Subscriptions ===
  @Post('create-subscription')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Create Stripe Subscription for a membership tier' })
  @ApiResponse({ status: 201, description: 'Subscription created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid tier or payment method' })
  createSubscription(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.paymentsService.createSubscription(userId, dto.tierId, dto.paymentMethodId);
  }

  @Delete('cancel-subscription')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Cancel Stripe Subscription' })
  @ApiResponse({ status: 200, description: 'Subscription cancelled successfully' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  cancelSubscription(
    @CurrentUser('id') userId: string,
    @Body('subscriptionId') subscriptionId: string,
  ) {
    return this.paymentsService.cancelSubscription(userId, subscriptionId);
  }

  // === Payment Methods ===
  @Get('payment-methods')
  @ApiOperation({ summary: "List user's saved payment methods" })
  @ApiResponse({ status: 200, description: 'List of payment methods' })
  listPaymentMethods(@CurrentUser('id') userId: string) {
    return this.paymentsService.listPaymentMethods(userId);
  }

  @Post('attach-payment-method')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Attach payment method to Stripe customer' })
  @ApiResponse({ status: 200, description: 'Payment method attached successfully' })
  @ApiResponse({ status: 400, description: 'Invalid payment method' })
  attachPaymentMethod(
    @CurrentUser('id') userId: string,
    @Body() dto: AttachPaymentMethodDto,
  ) {
    return this.paymentsService.attachPaymentMethod(userId, dto.paymentMethodId);
  }
}
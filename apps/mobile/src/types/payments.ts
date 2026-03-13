import type { Currency } from '@/types/monetization';

export interface PaymentIntent {
  clientSecret: string;
  amount: number;
  currency: Currency;
}

export interface PaymentMethod {
  id: string;
  brand: string;  // visa, mastercard, etc.
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

export interface CreatePaymentIntentDto {
  amount: number;
  currency: Currency;
  receiverId: string;
}

export interface CreateSubscriptionDto {
  tierId: string;
  paymentMethodId: string;
}

export interface CancelSubscriptionDto {
  subscriptionId: string;
}

export interface AttachPaymentMethodDto {
  paymentMethodId: string;
}

// Response for GET /payments/payment-methods
export type PaymentMethodsResponse = PaymentMethod[];

// Stripe customer if needed
export interface StripeCustomer {
  id: string;
  email?: string;
  name?: string;
}
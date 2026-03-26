import { api } from './api';
import type {
  PaymentIntent,
  PaymentMethod,
  CreatePaymentIntentDto,
  CreateSubscriptionDto,
  CancelSubscriptionDto,
  AttachPaymentMethodDto,
  PaymentMethodsResponse,
} from '@/types/payments';

export const paymentsApi = {
  // Create a PaymentIntent for one-time tip
  createPaymentIntent: (data: CreatePaymentIntentDto) =>
    api.post<PaymentIntent>('/payments/create-payment-intent', data),

  // Create a subscription for membership tier
  createSubscription: (data: CreateSubscriptionDto) =>
    api.post<void>('/payments/create-subscription', data),

  // Cancel an active subscription
  cancelSubscription: (data: CancelSubscriptionDto) =>
    api.post<void>('/payments/cancel-subscription', data),

  // List user's saved payment methods
  getPaymentMethods: () =>
    api.get<PaymentMethodsResponse>('/payments/payment-methods'),

  // Attach a payment method to customer
  attachPaymentMethod: (data: AttachPaymentMethodDto) =>
    api.post<void>('/payments/attach-payment-method', data),
};
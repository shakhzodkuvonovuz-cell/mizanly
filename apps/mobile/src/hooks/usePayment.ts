import { useState } from 'react';
import { useStripe } from '@stripe/stripe-react-native';
import { paymentsApi } from '@/services/paymentsApi';

export function usePayment() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payTip = async (receiverId: string, amount: number) => {
    setLoading(true);
    setError(null);
    try {
      // Create PaymentIntent on backend
      const paymentIntent = await paymentsApi.createPaymentIntent({
        amount,
        currency: 'USD', // default currency
        receiverId,
      });

      // Initialize Stripe PaymentSheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: paymentIntent.clientSecret,
        merchantDisplayName: 'Mizanly',
      });

      if (initError) {
        throw new Error(`Payment sheet initialization failed: ${initError.message}`);
      }

      // Present the sheet to user
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        throw new Error(`Payment failed: ${presentError.message}`);
      }

      // Success
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const subscribeTier = async (tierId: string, paymentMethodId: string) => {
    setLoading(true);
    setError(null);
    try {
      await paymentsApi.createSubscription({
        tierId,
        paymentMethodId,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Subscription failed';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const cancelSubscription = async (subscriptionId: string) => {
    setLoading(true);
    setError(null);
    try {
      await paymentsApi.cancelSubscription({ subscriptionId });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cancellation failed';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const attachPaymentMethod = async (paymentMethodId: string) => {
    setLoading(true);
    setError(null);
    try {
      await paymentsApi.attachPaymentMethod({ paymentMethodId });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to attach payment method';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentMethods = async () => {
    setLoading(true);
    setError(null);
    try {
      const paymentMethods = await paymentsApi.getPaymentMethods();
      return paymentMethods;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch payment methods';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  };

  return {
    payTip,
    subscribeTier,
    cancelSubscription,
    attachPaymentMethod,
    fetchPaymentMethods,
    loading,
    error,
    clearError: () => setError(null),
  };
}
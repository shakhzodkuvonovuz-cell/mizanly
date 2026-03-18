declare module '@stripe/stripe-react-native' {
  export interface InitPaymentSheetParams {
    paymentIntentClientSecret: string;
    merchantDisplayName: string;
    customerId?: string;
    customerEphemeralKeySecret?: string;
    allowsDelayedPaymentMethods?: boolean;
    defaultBillingDetails?: Record<string, unknown>;
    returnURL?: string;
  }

  export interface PresentPaymentSheetResult {
    error?: { code: string; message: string; localizedMessage?: string };
  }

  export interface InitPaymentSheetResult {
    error?: { code: string; message: string; localizedMessage?: string };
  }

  export function useStripe(): {
    initPaymentSheet: (params: InitPaymentSheetParams) => Promise<InitPaymentSheetResult>;
    presentPaymentSheet: () => Promise<PresentPaymentSheetResult>;
    confirmPayment: (clientSecret: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };

  export function StripeProvider(props: {
    publishableKey: string;
    merchantIdentifier?: string;
    urlScheme?: string;
    children: React.ReactNode;
  }): JSX.Element;
}

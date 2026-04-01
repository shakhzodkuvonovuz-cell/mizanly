import { api } from './api';

export interface WalletBalance {
  balance: number;
  currency: string;
  pendingBalance?: number;
}

export interface PaymentMethod {
  id: string;
  type: string;
  last4?: string;
  isDefault?: boolean;
}

export interface PayoutHistoryEntry {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
}

export const walletApi = {
  getBalance: () => api.get<WalletBalance>('/monetization/wallet/balance'),
  getPaymentMethods: () => api.get<PaymentMethod[]>('/monetization/wallet/payment-methods'),
  cashout: (payload: { amount: number; methodId: string }) =>
    api.post<{ success: boolean }>('/monetization/wallet/cashout', payload),
  getPayouts: () =>
    api.get<{ data: PayoutHistoryEntry[]; meta: { cursor: string | null; hasMore: boolean } }>('/monetization/wallet/payouts'),
};

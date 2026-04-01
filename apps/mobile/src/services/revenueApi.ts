import { api } from './api';

export interface RevenueOverview {
  totalEarnings: number;
  monthlyEarnings: number;
  pendingPayout: number;
  currency: string;
}

export interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  createdAt: string;
}

export const revenueApi = {
  getOverview: () => api.get<RevenueOverview>('/monetization/revenue'),
  getTransactions: (params?: { cursor?: string }) =>
    api.get<{ data: Transaction[]; meta: { cursor?: string; hasMore: boolean } }>(
      `/monetization/revenue/transactions${params?.cursor ? `?cursor=${params.cursor}` : ''}`,
    ),
};

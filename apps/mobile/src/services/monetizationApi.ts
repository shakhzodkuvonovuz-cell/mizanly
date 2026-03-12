import { api } from './api';
import type {
  Tip,
  CreateTipDto,
  TipStats,
  MembershipTier,
  CreateTierDto,
  UpdateTierDto,
  MembershipSubscription,
  SubscriptionStats,
} from '@/types/monetization';
import type { PaginatedResponse } from '@/types';
import type { User } from '@/types';

const qs = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');
  return s ? `?${s}` : '';
};

export const monetizationApi = {
  // Tips
  sendTip: (data: CreateTipDto) => api.post<Tip>('/monetization/tips', data),

  getSentTips: (cursor?: string) =>
    api.get<PaginatedResponse<Tip>>(`/monetization/tips/sent${qs({ cursor })}`),

  getReceivedTips: (cursor?: string) =>
    api.get<PaginatedResponse<Tip>>(`/monetization/tips/received${qs({ cursor })}`),

  getTipStats: () => api.get<TipStats>('/monetization/tips/stats'),

  // Membership Tiers
  createTier: (data: CreateTierDto) => api.post<MembershipTier>('/monetization/tiers', data),

  getUserTiers: (userId: string) =>
    api.get<MembershipTier[]>(`/monetization/tiers/${userId}`),

  updateTier: (id: string, data: UpdateTierDto) =>
    api.patch<MembershipTier>(`/monetization/tiers/${id}`, data),

  deleteTier: (id: string) => api.delete(`/monetization/tiers/${id}`),

  toggleTierActive: (id: string) => api.patch<MembershipTier>(`/monetization/tiers/${id}/toggle`),

  // Subscriptions
  subscribe: (tierId: string) =>
    api.post<MembershipSubscription>(`/monetization/subscribe/${tierId}`),

  unsubscribe: (tierId: string) =>
    api.delete(`/monetization/subscribe/${tierId}`),

  getSubscribers: (cursor?: string) =>
    api.get<PaginatedResponse<User & { subscription: MembershipSubscription }>>(
      `/monetization/subscribers${qs({ cursor })}`
    ),
};
import type { User } from '@/types';
import type { PaginatedResponse } from '@/types';

export type TipStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'SAR' | 'AED'; // extend as needed
export type MembershipTierLevel = 'bronze' | 'silver' | 'gold' | 'platinum';
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'pending';

export interface Tip {
  id: string;
  senderId: string;
  receiverId: string;
  amount: number;
  currency: Currency;
  message?: string;
  platformFee: number;
  status: TipStatus;
  createdAt: string;
  sender?: User;
  receiver?: User;
}

export interface MembershipTier {
  id: string;
  userId: string;
  user: User;
  name: string;
  price: number;
  currency: Currency;
  benefits: string[];
  isActive: boolean;
  level: MembershipTierLevel;
  createdAt: string;
  updatedAt: string;
  _count?: {
    subscriptions: number;
  };
}

export interface MembershipSubscription {
  id: string;
  tierId: string;
  tier: MembershipTier;
  userId: string;
  user: User;
  status: SubscriptionStatus;
  startDate: string;
  endDate?: string;
  createdAt: string;
}

// DTOs
export interface CreateTipDto {
  receiverId: string;
  amount: number;
  message?: string;
  currency?: Currency;
}

export interface CreateTierDto {
  name: string;
  price: number;
  benefits: string[];
  level: MembershipTierLevel;
  currency?: Currency;
}

export type UpdateTierDto = Partial<CreateTierDto>;

export interface TipStats {
  totalEarned: number;
  totalSent: number;
  topSupporters: Array<{
    user: User;
    totalAmount: number;
    tipCount: number;
  }>;
  monthlyBreakdown: Array<{
    month: string;
    earned: number;
    sent: number;
  }>;
}

export interface SubscriptionStats {
  totalSubscribers: number;
  monthlyRevenue: number;
  activeTiers: number;
  growthPercentage: number;
}
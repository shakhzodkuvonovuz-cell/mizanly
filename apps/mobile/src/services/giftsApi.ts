import { api, qs } from './api';

export interface GiftCatalogItem {
  type: string;
  name: string;
  coins: number;
  animation: string;
}

export interface GiftBalance {
  coins: number;
  diamonds: number;
}

export interface GiftHistoryItem {
  id: string;
  giftType: string;
  coins: number;
  senderId: string;
  receiverId: string;
  createdAt: string;
  senderName?: string;
  receiverName?: string;
}

export const giftsApi = {
  getBalance: () => api.get<GiftBalance>('/gifts/balance'),
  purchaseCoins: (data: { amount: number; paymentMethodId?: string }) =>
    api.post('/gifts/purchase', data),
  sendGift: (data: { receiverId: string; giftType: string; contentId?: string; contentType?: string }) =>
    api.post('/gifts/send', data),
  getCatalog: () => api.get<GiftCatalogItem[]>('/gifts/catalog'),
  getHistory: (cursor?: string) => api.get<{ data: GiftHistoryItem[]; meta: { cursor: string | null; hasMore: boolean } }>(`/gifts/history${qs({ cursor })}`),
  cashout: (data: { diamonds: number }) => api.post('/gifts/cashout', data),
  getReceived: (userId: string) => api.get<GiftHistoryItem[]>(`/gifts/received/${userId}`),
};

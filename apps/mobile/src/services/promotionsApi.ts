import { api } from './api';

export const promotionsApi = {
  boostPost: (data: { postId: string; budget: number; duration: number }) =>
    api.post('/promotions/boost', data),

  getMyPromotions: () => api.get('/promotions/mine'),

  cancelPromotion: (id: string) => api.post(`/promotions/${id}/cancel`),

  setReminder: (postId: string, remindAt: string) =>
    api.post('/promotions/reminder', { postId, remindAt }),

  removeReminder: (postId: string) =>
    api.delete(`/promotions/reminder/${postId}`),

  markBranded: (postId: string, partnerName: string) =>
    api.post('/promotions/branded', { postId, partnerName }),

  // Note: removeBranded endpoint does not exist on backend yet (finding 64-020)
  removeBranded: (postId: string) =>
    api.delete(`/promotions/branded/${postId}`),
};

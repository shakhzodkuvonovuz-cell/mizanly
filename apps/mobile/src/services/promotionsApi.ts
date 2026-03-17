import { api } from './api';

export const promotionsApi = {
  boostPost: (data: { postId: string; budget: number; duration: number }) =>
    api.post('/promotions/boost', data),

  getMyPromotions: () => api.get('/promotions/my'),

  cancelPromotion: (id: string) => api.delete(`/promotions/${id}`),

  setReminder: (postId: string, remindAt: string) =>
    api.post(`/promotions/remind/${postId}`, { remindAt }),

  removeReminder: (postId: string) =>
    api.delete(`/promotions/remind/${postId}`),

  markBranded: (postId: string, partnerName: string) =>
    api.patch(`/posts/${postId}/branded`, { partnerName }),

  removeBranded: (postId: string) =>
    api.delete(`/posts/${postId}/branded`),
};

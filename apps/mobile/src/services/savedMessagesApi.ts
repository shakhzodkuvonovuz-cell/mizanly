import { api } from './api';

export const savedMessagesApi = {
  list: (params?: { cursor?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.cursor) qs.set('cursor', params.cursor);
    if (params?.limit) qs.set('limit', params.limit.toString());
    return api.get<{ data: Array<Record<string, unknown>>; meta?: { cursor: string | null; hasMore: boolean } }>(
      `/saved-messages?${qs}`,
    );
  },
  create: (content: string) =>
    api.post<Record<string, unknown>>('/saved-messages', { content }),
  remove: (id: string) => api.delete(`/saved-messages/${id}`),
  pin: (id: string) => api.patch(`/saved-messages/${id}/pin`),
};

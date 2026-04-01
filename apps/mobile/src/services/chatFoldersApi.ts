import { api } from './api';

export const chatFoldersApi = {
  list: () => api.get<Array<Record<string, unknown>>>('/chat-folders'),
  create: (data: { name: string; icon: string }) =>
    api.post<Record<string, unknown>>('/chat-folders', data),
  update: (folderId: string, data: { name: string; icon: string }) =>
    api.patch<Record<string, unknown>>(`/chat-folders/${folderId}`, data),
  remove: (folderId: string) => api.delete(`/chat-folders/${folderId}`),
};

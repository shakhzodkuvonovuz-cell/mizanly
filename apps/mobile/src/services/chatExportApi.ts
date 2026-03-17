import { api } from './api';

export interface ChatExportStats {
  name: string;
  isGroup: boolean;
  memberCount: number;
  messageCount: number;
  mediaCount: number;
  createdAt: string;
}

export interface ChatExportResult {
  url: string;
  filename: string;
  size: number;
}

export const chatExportApi = {
  generateExport: (conversationId: string, data: { format: 'json' | 'text'; includeMedia: boolean }) =>
    api.post<ChatExportResult>(`/chat-export/${conversationId}`, data),
  getStats: (conversationId: string) =>
    api.get<ChatExportStats>(`/chat-export/${conversationId}/stats`),
};

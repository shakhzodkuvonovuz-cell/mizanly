import { api } from './api';

type DataExport = {
  user: Record<string, unknown>;
  posts: Record<string, unknown>[];
  threads: Record<string, unknown>[];
  stories: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  follows: Record<string, unknown>[];
  settings: Record<string, unknown>;
};

export const privacyApi = {
  exportData: () =>
    api.get<DataExport>('/privacy/export'),

  deleteAllData: () =>
    api.delete<{ success: boolean }>('/privacy/delete-all'),
};

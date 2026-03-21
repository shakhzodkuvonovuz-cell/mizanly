import { api } from './api';

type SessionDepthData = {
  scrollDepth: number;
  timeSpentMs: number;
  interactionCount: number;
  space: 'saf' | 'majlis' | 'risalah' | 'bakra' | 'minbar';
};

export const retentionApi = {
  trackSessionDepth: (data: SessionDepthData) =>
    api.post<{ success: boolean }>('/retention/session-depth', data),
};

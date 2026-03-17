import { api } from './api';
import type { ReelTemplate } from '@/types/reelTemplates';

const qs = (params: Record<string, string | number | undefined>) => {
  const s = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');
  return s ? `?${s}` : '';
};

export const reelTemplatesApi = {
  browse: (cursor?: string, trending?: boolean) =>
    api.get<{ data: ReelTemplate[]; meta: { cursor: string | null; hasMore: boolean } }>(
      `/reel-templates${qs({ cursor, trending: trending ? 'true' : undefined })}`
    ),
  getById: (id: string) => api.get<ReelTemplate>(`/reel-templates/${id}`),
  create: (data: { sourceReelId: string; segments: { startMs: number; endMs: number }[]; name: string }) =>
    api.post<ReelTemplate>('/reel-templates', data),
  use: (id: string) => api.post<void>(`/reel-templates/${id}/use`),
  delete: (id: string) => api.delete<void>(`/reel-templates/${id}`),
};

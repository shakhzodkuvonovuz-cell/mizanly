import { api } from './api';

export const creatorApi = {
  getPostInsights: (postId: string) =>
    api.get<Record<string, unknown>>(`/creator/insights/post/${postId}`),
  getReelInsights: (reelId: string) =>
    api.get<Record<string, unknown>>(`/creator/insights/reel/${reelId}`),
  getOverview: () =>
    api.get<Record<string, unknown>>('/creator/analytics/overview'),
  getAudience: () =>
    api.get<Record<string, unknown>>('/creator/analytics/audience'),
  getContent: () =>
    api.get<Record<string, unknown>>('/creator/analytics/content'),
  getGrowth: () =>
    api.get<Record<string, unknown>>('/creator/analytics/growth'),
  getRevenue: () =>
    api.get<Record<string, unknown>>('/creator/analytics/revenue'),
};

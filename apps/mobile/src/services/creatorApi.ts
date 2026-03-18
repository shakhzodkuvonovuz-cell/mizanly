import { api } from './api';

interface AudienceData {
  ageGroups: { range: string; percentage: number }[];
  topCountries: { name: string; percentage: number }[];
  genderSplit: { male: number; female: number; other: number };
}

interface RevenueData {
  total: string;
  tips: string;
  memberships: string;
  history: { month: string; amount: number }[];
}

interface OverviewData {
  views?: number; viewsChange?: number;
  followers?: number; followersChange?: number;
  engagement?: number; engagementChange?: number;
  revenue?: number; revenueChange?: number;
}

interface ContentData {
  topPosts: { id: string; title?: string; views: number; likes: number; thumbnailUrl?: string; postType?: string }[];
  bestTimes: { day: string; hour: string; engagement: number }[];
}

export const creatorApi = {
  getPostInsights: (postId: string) =>
    api.get<Record<string, unknown>>(`/creator/insights/post/${postId}`),
  getReelInsights: (reelId: string) =>
    api.get<Record<string, unknown>>(`/creator/insights/reel/${reelId}`),
  getOverview: () =>
    api.get<OverviewData>('/creator/analytics/overview'),
  getAudience: () =>
    api.get<AudienceData>('/creator/analytics/audience'),
  getContent: () =>
    api.get<ContentData>('/creator/analytics/content'),
  getGrowth: () =>
    api.get<Record<string, unknown>>('/creator/analytics/growth'),
  getRevenue: () =>
    api.get<RevenueData>('/creator/analytics/revenue'),
};

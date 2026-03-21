import { api } from './api';

type ThumbnailVariant = {
  id: string;
  contentType: string;
  contentId: string;
  thumbnailUrl: string;
  impressions: number;
  clicks: number;
  ctr: number;
  isWinner: boolean;
};

export const thumbnailsApi = {
  createVariants: (data: {
    contentType: 'post' | 'reel' | 'video';
    contentId: string;
    thumbnailUrls: string[];
  }) =>
    api.post<ThumbnailVariant[]>('/thumbnails/variants', data),

  getVariants: (contentType: string, contentId: string) =>
    api.get<ThumbnailVariant[]>(`/thumbnails/variants/${contentType}/${contentId}`),

  serve: (contentType: string, contentId: string) =>
    api.get<{ thumbnailUrl: string }>(`/thumbnails/serve/${contentType}/${contentId}`),

  trackImpression: (variantId: string) =>
    api.post<void>('/thumbnails/impression', { variantId }),

  trackClick: (variantId: string) =>
    api.post<void>('/thumbnails/click', { variantId }),
};

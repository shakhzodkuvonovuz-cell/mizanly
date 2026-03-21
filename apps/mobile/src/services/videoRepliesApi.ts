import { api, qs } from './api';

type VideoReply = {
  id: string;
  userId: string;
  commentId: string;
  commentType: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  duration?: number;
  createdAt: string;
  user?: { id: string; displayName: string; avatarUrl?: string };
};

type PaginatedResponse<T> = { data: T[]; meta: { cursor?: string; hasMore: boolean } };

export const videoRepliesApi = {
  create: (data: {
    commentId: string;
    commentType: 'post' | 'reel';
    mediaUrl: string;
    thumbnailUrl?: string;
    duration?: number;
  }) =>
    api.post<VideoReply>('/video-replies', data),

  getByComment: (commentId: string, cursor?: string) =>
    api.get<PaginatedResponse<VideoReply>>(
      `/video-replies/comment/${commentId}${qs({ cursor })}`,
    ),

  getById: (id: string) =>
    api.get<VideoReply>(`/video-replies/${id}`),

  delete: (id: string) =>
    api.delete<void>(`/video-replies/${id}`),
};

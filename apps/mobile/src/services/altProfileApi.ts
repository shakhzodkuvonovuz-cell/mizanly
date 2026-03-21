import { api, qs } from './api';

type AltProfile = {
  id: string;
  userId: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  createdAt: string;
};

type AltProfileAccess = {
  id: string;
  altProfileId: string;
  userId: string;
  grantedAt: string;
  user?: { id: string; displayName: string; avatarUrl?: string };
};

type AltPost = {
  id: string;
  userId: string;
  content?: string;
  mediaUrls?: string[];
  createdAt: string;
};

type PaginatedResponse<T> = { data: T[]; meta: { cursor?: string; hasMore: boolean } };

export const altProfileApi = {
  // Own alt profile
  get: () =>
    api.get<AltProfile>('/users/me/alt-profile'),

  create: (data: { displayName: string; bio?: string; avatarUrl?: string }) =>
    api.post<AltProfile>('/users/me/alt-profile', data),

  update: (data: { displayName?: string; bio?: string; avatarUrl?: string }) =>
    api.put<AltProfile>('/users/me/alt-profile', data),

  delete: () =>
    api.delete<void>('/users/me/alt-profile'),

  // Access control
  addAccess: (userIds: string[]) =>
    api.post<void>('/users/me/alt-profile/access', { userIds }),

  removeAccess: (targetUserId: string) =>
    api.delete<void>(`/users/me/alt-profile/access/${targetUserId}`),

  getAccessList: () =>
    api.get<AltProfileAccess[]>('/users/me/alt-profile/access'),

  // Own alt posts
  getOwnPosts: (cursor?: string) =>
    api.get<PaginatedResponse<AltPost>>(
      `/users/me/alt-profile/posts${qs({ cursor })}`,
    ),

  // View other user's alt profile
  viewProfile: (userId: string) =>
    api.get<AltProfile>(`/users/${userId}/alt-profile`),

  viewPosts: (userId: string, cursor?: string) =>
    api.get<PaginatedResponse<AltPost>>(
      `/users/${userId}/alt-profile/posts${qs({ cursor })}`,
    ),
};

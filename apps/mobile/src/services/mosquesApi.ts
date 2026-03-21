import { api, qs } from './api';

type Mosque = {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  madhab?: string;
  language?: string;
  phone?: string;
  website?: string;
  imageUrl?: string;
  memberCount?: number;
  createdAt: string;
};

type MosquePost = {
  id: string;
  mosqueId: string;
  userId: string;
  content: string;
  mediaUrls?: string[];
  createdAt: string;
  user?: { id: string; displayName: string; avatarUrl?: string };
};

type MosqueMember = {
  id: string;
  userId: string;
  mosqueId: string;
  joinedAt: string;
  user?: { id: string; displayName: string; avatarUrl?: string };
};

type PaginatedResponse<T> = { data: T[]; meta: { cursor?: string; hasMore: boolean } };

export const mosquesApi = {
  findNearby: (lat: number, lng: number, radius?: number) =>
    api.get<Mosque[]>(`/mosques/nearby${qs({ lat, lng, radius })}`),

  create: (data: {
    name: string;
    address: string;
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    madhab?: string;
    language?: string;
    phone?: string;
    website?: string;
    imageUrl?: string;
  }) =>
    api.post<Mosque>('/mosques', data),

  getMyMosques: () =>
    api.get<Mosque[]>('/mosques/my/memberships'),

  getById: (id: string) =>
    api.get<Mosque>(`/mosques/${id}`),

  join: (mosqueId: string) =>
    api.post<{ success: boolean }>(`/mosques/${mosqueId}/join`, {}),

  leave: (mosqueId: string) =>
    api.delete<void>(`/mosques/${mosqueId}/leave`),

  getFeed: (mosqueId: string, cursor?: string) =>
    api.get<PaginatedResponse<MosquePost>>(
      `/mosques/${mosqueId}/feed${qs({ cursor })}`,
    ),

  createPost: (mosqueId: string, data: { content: string; mediaUrls?: string[] }) =>
    api.post<MosquePost>(`/mosques/${mosqueId}/posts`, data),

  getMembers: (mosqueId: string, cursor?: string) =>
    api.get<PaginatedResponse<MosqueMember>>(
      `/mosques/${mosqueId}/members${qs({ cursor })}`,
    ),
};

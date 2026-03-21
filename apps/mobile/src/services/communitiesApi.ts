import { api, qs } from './api';
import type {
  Community,
  CommunityMember,
  CreateCommunityDto,
  UpdateCommunityDto,
} from '@/types/communities';
import type { PaginatedResponse } from '@/types';

export const communitiesApi = {
  create: (data: CreateCommunityDto) => api.post<Community>('/communities', data),

  list: (cursor?: string, limit?: number) =>
    api.get<PaginatedResponse<Community>>(`/communities${qs({ cursor, limit })}`),

  getById: (id: string) => api.get<Community>(`/communities/${id}`),

  update: (id: string, data: UpdateCommunityDto) => api.patch<Community>(`/communities/${id}`, data),

  delete: (id: string) => api.delete(`/communities/${id}`),

  join: (id: string) => api.post<Community>(`/communities/${id}/join`),

  leave: (id: string) => api.delete<Community>(`/communities/${id}/leave`),

  listMembers: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<CommunityMember>>(`/communities/${id}/members${qs({ cursor })}`),
};
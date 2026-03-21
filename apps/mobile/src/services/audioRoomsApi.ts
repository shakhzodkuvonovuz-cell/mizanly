import { api, qs } from './api';
import type {
  AudioRoom,
  CreateAudioRoomDto,
  UpdateParticipantRoleDto,
  AudioRoomParticipant,
} from '@/types/audioRooms';
import type { PaginatedResponse } from '@/types';

export const audioRoomsApi = {
  create: (data: CreateAudioRoomDto) => api.post<AudioRoom>('/audio-rooms', data),

  list: (cursor?: string, status?: string) =>
    api.get<PaginatedResponse<AudioRoom>>(`/audio-rooms${qs({ cursor, status })}`),

  getById: (id: string) => api.get<AudioRoom>(`/audio-rooms/${id}`),

  delete: (id: string) => api.delete(`/audio-rooms/${id}`),

  join: (roomId: string) => api.post<AudioRoomParticipant>(`/audio-rooms/${roomId}/join`),

  leave: (roomId: string) => api.delete(`/audio-rooms/${roomId}/leave`),

  changeRole: (roomId: string, data: UpdateParticipantRoleDto) =>
    api.patch<AudioRoomParticipant>(`/audio-rooms/${roomId}/role`, data),

  toggleHand: (roomId: string) =>
    api.patch<AudioRoomParticipant>(`/audio-rooms/${roomId}/hand`),

  toggleMute: (roomId: string, userId?: string) =>
    api.patch<AudioRoomParticipant>(`/audio-rooms/${roomId}/mute`, userId ? { userId } : undefined),

  listParticipants: (roomId: string, cursor?: string, role?: string) =>
    api.get<PaginatedResponse<AudioRoomParticipant>>(`/audio-rooms/${roomId}/participants${qs({ cursor, role })}`),
};